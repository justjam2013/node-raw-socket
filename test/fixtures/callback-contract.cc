#include "raw.h"
static int peerPort = 0;
static int readable = 0, writable = 0, receives = 0, sends = 0;
// Only privileged descriptor creation is substituted. Production nonblocking
// setup, polling, Send/sendto and Recv/recvfrom are included below unchanged.
static SOCKET CreateUDP(int family) {
  SOCKET fd = socket(family, SOCK_DGRAM, IPPROTO_UDP);
  if (fd == INVALID_SOCKET) return fd;
  sockaddr_in address = {};
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(fd, reinterpret_cast<sockaddr*>(&address), sizeof(address))) {
    closesocket(fd); return INVALID_SOCKET;
  }
  return fd;
}
#include "raw.cc"
NAN_METHOD(Peer) { peerPort = Nan::To<int32_t>(info[0]).FromJust(); }
NAN_METHOD(Dispatch) {
  auto s = Nan::ObjectWrap::Unwrap<raw::SocketWrap>(info[0].As<Object>());
  s->HandleIOEvent(Nan::To<int32_t>(info[1]).FromJust(), Nan::To<int32_t>(info[2]).FromJust());
}
NAN_METHOD(State) {
  auto result = Nan::New<Object>();
#define COUNT(name) Nan::Set(result, Nan::New(#name).ToLocalChecked(), Nan::New(name))
  COUNT(readable); COUNT(writable); COUNT(receives); COUNT(sends);
#undef COUNT
  if (info.Length()) {
    auto s = Nan::ObjectWrap::Unwrap<raw::SocketWrap>(info[0].As<Object>());
    sockaddr_in address = {};
    SOCKET_LEN_TYPE length = sizeof(address);
    if (getsockname(s->poll_fd_, reinterpret_cast<sockaddr*>(&address), &length)) {
      Nan::ThrowError("fixture getsockname failed"); return;
    }
    Nan::Set(result, Nan::New("port").ToLocalChecked(), Nan::New(ntohs(address.sin_port)));
  }
  info.GetReturnValue().Set(result);
}
NAN_MODULE_INIT(InitHarness) {
  raw::InitAll(target);
  Nan::SetMethod(target, "peer", Peer);
  Nan::SetMethod(target, "dispatch", Dispatch);
  Nan::SetMethod(target, "state", State);
  Nan::Set(target, Nan::New("badfd").ToLocalChecked(), Nan::New(UV_EBADF));
}
NODE_MODULE(harness, InitHarness)
