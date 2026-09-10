#include "raw.cc"
struct Pending {
  uv_timer_t timer;
  Nan::Persistent<v8::Object> object;
  int status;
  int events;
};
void Fire(uv_timer_t* timer) {
  Nan::HandleScope scope;
  Pending* p = static_cast<Pending*>(timer->data);
  uv_poll_t watcher;
  watcher.data = Nan::ObjectWrap::Unwrap<raw::SocketWrap>(Nan::New(p->object));
  raw::IoEvent(&watcher, p->status, p->events);
  p->object.Reset();
  uv_close(reinterpret_cast<uv_handle_t*>(timer), [](uv_handle_t* h) {
    delete static_cast<Pending*>(h->data);
  });
}
NAN_METHOD(Dispatch) {
  auto object = info[0].As<v8::Object>();
  int status = Nan::To<int32_t>(info[1]).FromJust();
  int events = Nan::To<int32_t>(info[2]).FromJust();
  if (Nan::To<bool>(info[3]).FromJust()) {
    Pending* p = new Pending;
    p->object.Reset(object);
    p->status = status;
    p->events = events;
    uv_timer_init(uv_default_loop(), &p->timer);
    p->timer.data = p;
    uv_timer_start(&p->timer, Fire, 0, 0);
  } else {
    uv_poll_t watcher;
    watcher.data = Nan::ObjectWrap::Unwrap<raw::SocketWrap>(object);
    raw::IoEvent(&watcher, status, events);
  }
}
NAN_MODULE_INIT(InitHarness) {
  raw::InitAll(target);
  Nan::SetMethod(target, "dispatch", Dispatch);
}
NODE_MODULE(harness, InitHarness)
