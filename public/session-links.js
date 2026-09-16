export function cameraSessionLink(baseUrl, room, token) {
  const url = new URL('/camera.html', baseUrl);
  url.searchParams.set('room', room);
  url.searchParams.set('token', token);
  return url.toString();
}

export function mobileControllerSessionLink(baseUrl, room, token) {
  const url = new URL('/mobile-controller.html', baseUrl);
  url.searchParams.set('room', room);
  url.searchParams.set('token', token);
  return url.toString();
}
