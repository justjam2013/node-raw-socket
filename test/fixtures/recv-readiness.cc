#include "raw.h"

static int starts = 0;
static int lastEvents = 0;
static int Restart(uv_poll_t* handle, int events, uv_poll_cb cb) {
  ++starts;
  lastEvents = events;
  return uv_poll_start(handle, events, cb);
}
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
static int failure = 0;
static int attempts = 0;
#ifdef _WIN32
using ReceiveLength = int;
#else
using ReceiveLength = size_t;
#endif
static decltype(recvfrom(0, nullptr, 0, 0, nullptr, nullptr)) Receive(
    SOCKET fd, char* buffer, ReceiveLength length, int flags, sockaddr* address, SOCKET_LEN_TYPE* addressLength) {
  ++attempts;
  if (failure) {
#ifdef _WIN32
    WSASetLastError(failure);
#else
    errno = failure;
#endif
    failure = 0;
    return SOCKET_ERROR;
  }
  return recvfrom(fd, buffer, length, flags, address, addressLength);
}
#include "raw.cc"
NAN_METHOD(Fail) { failure = Nan::To<int32_t>(info[0]).FromJust(); }
NAN_METHOD(Readable) {
  auto s = Nan::ObjectWrap::Unwrap<raw::SocketWrap>(info[0].As<Object>());
  s->HandleIOEvent(0, UV_READABLE);
}
NAN_METHOD(State) {
  auto s = Nan::ObjectWrap::Unwrap<raw::SocketWrap>(info[0].As<Object>());
  auto result = Nan::New<Object>();
  Nan::Set(result, Nan::New("active").ToLocalChecked(), Nan::New(s->poll_watcher_ && uv_is_active(reinterpret_cast<uv_handle_t*>(s->poll_watcher_))));
  Nan::Set(result, Nan::New("pollError").ToLocalChecked(), Nan::New(s->poll_error_));
  Nan::Set(result, Nan::New("attempts").ToLocalChecked(), Nan::New(attempts));
  Nan::Set(result, Nan::New("initialised").ToLocalChecked(), Nan::New(s->poll_initialised_));
  Nan::Set(result, Nan::New("watcher").ToLocalChecked(), Nan::New(s->poll_watcher_ != nullptr));
  Nan::Set(result, Nan::New("fd").ToLocalChecked(), Nan::New(s->poll_fd_ != INVALID_SOCKET));
  Nan::Set(result, Nan::New("closed").ToLocalChecked(), Nan::New(s->closed_));
  Nan::Set(result, Nan::New("starts").ToLocalChecked(), Nan::New(starts));
  Nan::Set(result, Nan::New("events").ToLocalChecked(), Nan::New(lastEvents));
  if (s->poll_fd_ != INVALID_SOCKET) {
    sockaddr_in address = {};
    SOCKET_LEN_TYPE length = sizeof(address);
    getsockname(s->poll_fd_, reinterpret_cast<sockaddr*>(&address), &length);
    Nan::Set(result, Nan::New("port").ToLocalChecked(), Nan::New(ntohs(address.sin_port)));
  }
  info.GetReturnValue().Set(result);
}
// Included after platform-dependent production code so synthetic macros cannot affect it.
#pragma push_macro("_WIN32")
#pragma push_macro("EAGAIN")
#pragma push_macro("EWOULDBLOCK")
#pragma push_macro("WSAEWOULDBLOCK")
#include "transient.h"
#pragma pop_macro("WSAEWOULDBLOCK")
#pragma pop_macro("EWOULDBLOCK")
#pragma pop_macro("EAGAIN")
#pragma pop_macro("_WIN32")
NAN_MODULE_INIT(InitHarness) {
  if (!winsock(10035) || winsock(11) || winsock(10009) ||
      !equal(11) || equal(9) || !distinct(11) || !distinct(35) || distinct(9)) {
    Nan::ThrowError("platform transient predicate failed"); return;
  }

  raw::InitAll(target);
#ifdef _WIN32
  const int again = WSAEWOULDBLOCK, wouldblock = WSAEWOULDBLOCK, genuine = WSAEBADF;
#else
  const int again = EAGAIN, wouldblock = EWOULDBLOCK, genuine = EBADF;
#endif
  Nan::Set(target, Nan::New("again").ToLocalChecked(), Nan::New(again));
  Nan::Set(target, Nan::New("wouldblock").ToLocalChecked(), Nan::New(wouldblock));
  Nan::Set(target, Nan::New("genuine").ToLocalChecked(), Nan::New(genuine));
  Nan::SetMethod(target, "readable", Readable);
  Nan::SetMethod(target, "fail", Fail);
  Nan::SetMethod(target, "state", State);
}
NODE_MODULE(harness, InitHarness)
