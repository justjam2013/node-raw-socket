#include "raw.h"
static bool failNext = false;
static int starts = 0;
static int deleted = 0;
static int lastEvents = 0;
static int Restart(uv_poll_t* handle, int events, uv_poll_cb cb) {
  ++starts;
  lastEvents = events;
  if (failNext) { failNext = false; return UV_EIO; }
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
#include "raw.cc"
NAN_METHOD(Fail) { failNext = true; }
NAN_METHOD(State) {
  auto s = Nan::ObjectWrap::Unwrap<raw::SocketWrap>(info[0].As<Object>());
  auto result = Nan::New<Object>();
  Nan::Set(result, Nan::New("deleted").ToLocalChecked(), Nan::New(deleted));
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
NAN_MODULE_INIT(InitHarness) {
  raw::InitAll(target);
  Nan::Set(target, Nan::New("failure").ToLocalChecked(), Nan::New(UV_EIO));
  Nan::SetMethod(target, "fail", Fail);
  Nan::SetMethod(target, "state", State);
}
NODE_MODULE(harness, InitHarness)
