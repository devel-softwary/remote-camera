export function cameraSessionLink(baseUrl, room, token, localMode = false) {
  const url = new URL('/camera.html', baseUrl);
  url.searchParams.set('room', room);
  url.searchParams.set('token', token);
  if (localMode) url.searchParams.set('local', '1');
  return url.toString();
}

export function localCameraLink(baseUrl) {
  const url = new URL('/camera.html', baseUrl);
  url.searchParams.set('local', '1');
  return url.toString();
}

export function mobileControllerSessionLink(baseUrl, room, token) {
  const url = new URL('/mobile-controller.html', baseUrl);
  url.searchParams.set('room', room);
  url.searchParams.set('token', token);
  return url.toString();
}
