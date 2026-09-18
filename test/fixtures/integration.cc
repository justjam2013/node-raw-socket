#include "raw.h"
static int peerPort = 0;
static int creates = 0, readable = 0, writable = 0, combined = 0;
static int receives = 0, sends = 0, closes = 0, destroyed = 0, deleted = 0;
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
NAN_METHOD(DescriptorOpen) {
  int fd = Nan::To<int32_t>(info[0]).FromJust();
  int type = 0;
  SOCKET_LEN_TYPE length = sizeof(type);
  info.GetReturnValue().Set(Nan::New(getsockopt(fd, SOL_SOCKET, SO_TYPE, reinterpret_cast<SOCKET_OPT_TYPE>(&type), &length) == 0));
}
NAN_METHOD(State) {
  auto result = Nan::New<Object>();
#define COUNT(name) Nan::Set(result, Nan::New(#name).ToLocalChecked(), Nan::New(name))
  COUNT(creates); COUNT(readable); COUNT(writable); COUNT(combined);
  COUNT(receives); COUNT(sends); COUNT(closes); COUNT(destroyed); COUNT(deleted);
#undef COUNT
  if (info.Length()) {
    auto s = Nan::ObjectWrap::Unwrap<raw::SocketWrap>(info[0].As<Object>());
    Nan::Set(result, Nan::New("watcher").ToLocalChecked(), Nan::New(s->poll_watcher_ != nullptr));
    Nan::Set(result, Nan::New("initialised").ToLocalChecked(), Nan::New(s->poll_initialised_));
    Nan::Set(result, Nan::New("active").ToLocalChecked(), Nan::New(s->poll_watcher_ && uv_is_active(reinterpret_cast<uv_handle_t*>(s->poll_watcher_))));
    Nan::Set(result, Nan::New("fd").ToLocalChecked(), Nan::New(s->poll_fd_ != INVALID_SOCKET));
    Nan::Set(result, Nan::New("descriptor").ToLocalChecked(), Nan::New(s->poll_fd_));
    if (s->poll_fd_ != INVALID_SOCKET) {
      sockaddr_in address = {};
      SOCKET_LEN_TYPE length = sizeof(address);
      getsockname(s->poll_fd_, reinterpret_cast<sockaddr*>(&address), &length);
      Nan::Set(result, Nan::New("port").ToLocalChecked(), Nan::New(ntohs(address.sin_port)));
    }
  }
  info.GetReturnValue().Set(result);
}
NAN_MODULE_INIT(InitHarness) {
  raw::InitAll(target);
  Nan::SetMethod(target, "descriptorOpen", DescriptorOpen);
  Nan::SetMethod(target, "peer", Peer);
  Nan::SetMethod(target, "dispatch", Dispatch);
  Nan::SetMethod(target, "state", State);
  Nan::Set(target, Nan::New("badfd").ToLocalChecked(), Nan::New(UV_EBADF));
}
NODE_MODULE(harness, InitHarness)
