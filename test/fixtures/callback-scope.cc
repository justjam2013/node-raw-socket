#include "raw.h"
static int ioEntries = 0, handlerEntries = 0, recvEntries = 0;
static unsigned work = 0;
static uv_check_t observer;
static SOCKET CreateUDP(int family) {
  SOCKET fd = socket(family, SOCK_DGRAM, IPPROTO_UDP);
  sockaddr_in address = {};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(fd, reinterpret_cast<sockaddr*>(&address), sizeof(address))) {
    closesocket(fd);
    return INVALID_SOCKET;
  }
  return fd;
}
#include "raw.cc"
// This observer never enters JS: it cannot flush Node's task queues itself.
static void Observe(uv_check_t* handle) {
  if (!ioEntries) return;
  printf("native observer: IoEvent=%d HandleIOEvent=%d Recv=%d work=%u\n",
         ioEntries, handlerEntries, recvEntries, work);
  fflush(stdout);
  uv_check_stop(handle);
  uv_close(reinterpret_cast<uv_handle_t*>(handle), nullptr);
  if (ioEntries != 1 || handlerEntries != 1 || recvEntries != 1) exit(2);
  if (work != 15 && !handle->data) exit(3);
}
// Real readable readiness with a synthetic combined mask, independent of
// platform-specific UDP writability. Production IoEvent/dispatch are unchanged.
static void Combined(uv_poll_t* watcher, int status, int events) {
  raw::IoEvent(watcher, status, events | UV_WRITABLE);
}
NAN_METHOD(Mark) { work |= Nan::To<uint32_t>(info[0]).FromJust(); }
NAN_METHOD(Start) {
  auto socket = Nan::ObjectWrap::Unwrap<raw::SocketWrap>(info[0].As<Object>());
  sockaddr_in address = {};
  SOCKET_LEN_TYPE length = sizeof(address);
  if (getsockname(socket->poll_fd_, reinterpret_cast<sockaddr*>(&address), &length)) {
    Nan::ThrowError("getsockname failed"); return;
  }
  SOCKET sender = ::socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
  const char packet[] = "scope packet";
  int sent = sendto(sender, packet, sizeof(packet) - 1, 0,
                    reinterpret_cast<sockaddr*>(&address), length);
  closesocket(sender);
  if (sent != sizeof(packet) - 1) { Nan::ThrowError("sendto failed"); return; }
  if (Nan::To<bool>(info[2]).FromJust() &&
      uv_poll_start(socket->poll_watcher_, UV_READABLE, Combined)) {
    Nan::ThrowError("combined poll start failed"); return;
  }
  uv_check_init(uv_default_loop(), &observer);
  observer.data = Nan::To<bool>(info[1]).FromJust() ? &work : nullptr;
  uv_check_start(&observer, Observe);
}
NAN_MODULE_INIT(InitHarness) {
  raw::InitAll(target);
  Nan::SetMethod(target, "start", Start);
  Nan::SetMethod(target, "mark", Mark);
}
NODE_MODULE(harness, InitHarness)
