# Changes

## Version 1.0.0 - 29/01/2013

 * Initial release

## Version 1.0.1 - 01/02/2013

 * Move `SOCKET_ERRNO` define from `raw.cc` to `raw.h`
 * Error in exception thrown by `SocketWrap::New` in `raw.cc` stated that two
   arguments were required, this should be one
 * Corrections to the README.md
 * Missing includes causes compilation error on some systems (maybe Node
   version dependant)

## Version 1.0.2 - 02/02/2013

 * Support automatic checksum generation

## Version 1.1.0 - 13/02/2013

 * The [net-ping][net-ping] module is now implemented so update the note about
   it in the first section of the README.md
 * Support IPv6
 * Support the `IP_HDRINCL` socket option via the `noIpHeader` option to the
   `createSocket()` function and the `noIpHeader()` method exposed by the
   `Socket` class

## Version 1.1.1 - 14/02/2013

 * IP addresses not being validated

## Version 1.1.2 - 15/02/2013

 * Default protocol option to `createSession()` was incorrect in the README.md
 * The `session.on("message")` example used `message` instead of `buffer` in
   the README.md

## Version 1.1.3 - 04/03/2013

 * `raw.Socket.onSendReady()` emit's an error when `raw.SocketWrap.send()`
   throws an exception when it should call the `req.callback` callback
 * Added the `pauseRecv()`, `resumeRecv()`, `pauseSend()` and `resumeSend()`
   methods

[net-ping]: https://npmjs.org/package/net-ping "net-ping"

## Version 1.1.4 - 05/03/2013

 * Cleanup documentation for the `pauseSend()`, `pauseRecv()`, `resumeSend()`
   and `resumeRecv()` methods in the README.md

## Version 1.1.5 - 09/05/2013

 * Reformated lines in the README.md file inline with the rest of the file
 * Removed the `noIpHeader()` method (the `setOption()` method should be
   used to configure the `IP_HDRINCL` socket option - and possibly
   `IPV6_HDRINCL` on Windows platforms), and removed the `Automatic IP Header
   Generation` section from the README.md file
 * Added the `setOption()` and `getOption()` methods, and added the
   `SocketLevel` and `SocketOption` constants
 * Tidied up the example program `ping-no-ip-header.js` (now uses the
   `setOption()` method to configure the `IP_HDRINCL` socket option)
 * Tidied up the example program `ping6-no-ip-header.js` (now uses the
   `setOption()` method to configure the `IPV6_HDRINCL` socket option)
 * Added the example program `get-option.js`
 * Added the example program `ping-set-option-ip-ttl.js`
 * Use MIT license instead of GPL

## Version 1.1.6 - 18/05/2013

 * Added the `beforeCallback` parameter to the `send()` method, and renamed the
   `callback` parameter to `afterCallback`
 * Fixed a few typos in the README.md file
 * Modified the example program `ping-set-option-ip-ttl.js` to use the
   `beforeCallback` parameter to the `send()` method
 * The example program `ping6-no-ip-header.js` was not passing the correct
   arguments to the `setOption()` method

## Version 1.1.7 - 23/06/2013

 * Added the `htonl()`, `htons()`, `ntohl()`, and `ntohs()` functions, and
   associated example programs
 * Added the `createChecksum()` function, and associated example program

## Version 1.1.8 - 01/07/2013

 * Added the `writeChecksum()` function
 * Removed the "Automated Checksum Generation" feature - this has been
   replaced with the `createChecksum()` and `writeChecksum()` functions

## Version 1.2.0 - 02/07/2013

 * Up version number to 1.2.0 (we should have done this for 1.1.8 because it
   introduced some API breaking changes)

## Version 1.2.1 - 15/08/2013

 * Receiving `Assertion '!(handle->flags & (UV_CLOSING | UV_CLOSED))' failed`
   error after a number of pings - the underlying `uv_poll_t` handle was being
   closed twice

## Version 1.2.2 - 21/09/2013

 * Using uint16_t instead of uint32_t on line 87 in src/raw.cc for a value
   that is out of range
 * raw::SocketWrap::pause() only uses the first argument
 * Delete uv_poll_t watcher in uv_close() OnClose callback instead of in the
   wrapped C++ objects deconstructor

## Version 1.3.0 - 10/07/2015

 * Support Node.js 0.12.x using the Native Abstractions for Node interface
 * Added export for the `SO_BINDTODEVICE` socket option for Linux platforms
 * On MAC OS X platforms re-attempt to create a socket using `SOCK_DGRAM`
   instead of `SOCK_RAW` when `IPPROTO_ICMP` was requested by the user, this
   provides non-privileged users access to the ICMP protocol on this platform

## Version 1.3.1 - 10/07/2015

 * Missing bracket for when compiling under the MAC OS X platform :(

## Version 1.3.2 - 03/08/2015

 * Add version dependency "<2.0.0" for the "nan" module to prevent build
   failures during installation because of breaking API changes

## Version 1.3.3 - 22/09/2015

 * Host repository on GitHub

## Version 1.4.0 - 09/10/2015

 * Support Native Abstractions for Node 2.x
 * Add-on module crashes when emitting `close` events during garbage collection
   of a wrapped object
 * Support Node.js 4.x

## Version 1.5.0 - 15/05/2016

 * Require nan 2.3.x to support node version 6

## Version 1.5.1 - 16/11/2016

 * Explicitly publish to npm using UNIX line endings

## Version 1.5.2 - 11/01/2018

 * Add note to README.md on how to reduce packet loss using the `SO_RCVBUF`
   socket option
 * Address warnings for `v8::Value::ToUint32 was declared deprecated`

## Version 1.6.0 - 02/05/2018

 * Support Node.js 10

## Version 1.6.1 - 06/06/2018

 * Set NoSpaceships Ltd to be the owner and maintainer

## Version 1.6.2 - 07/06/2018

 * Remove redundant sections from README.md

## Version 1.6.3 - 03/10/2018

 * Include addon `.node` file extension for node-webkit compatibility

## Version 1.6.4 - 02/11/2018

 * Prevent assertion failures when closing a socket and calling pauseRecv()

## Version 1.7.0 - 12/06/2019

 * Support Node.js 12 using nan 2.14

## Version 1.8.1 - 08/04/2024

 * Use nan 2.19.* to support up to Node.js 21
