export function createPhotoLazyLoader({
  loadThumbnail = async () => null,
  IntersectionObserverImpl = globalThis.IntersectionObserver,
  createObjectURL = blob => URL.createObjectURL(blob),
  revokeObjectURL = url => URL.revokeObjectURL(url),
  rootMargin = '300px 0px'
} = {}) {
  const jobs = new Map();
  const observer = IntersectionObserverImpl ? new IntersectionObserverImpl(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      start(entry.target);
    }
  }, { rootMargin }) : null;

  function setState(image, state) {
    image.dataset.lazyState = state;
    image.parentElement?.setAttribute('aria-busy', String(state === 'pending' || state === 'loading'));
  }

  function releaseObjectUrl(job) {
    if (!job.objectUrl) return;
    revokeObjectURL(job.objectUrl);
    job.objectUrl = null;
  }

  function finish(image, state) {
    const job = jobs.get(image);
    if (!job?.active) return;
    setState(image, state);
    releaseObjectUrl(job);
  }

  async function start(image) {
    const job = jobs.get(image);
    if (!job?.active || job.started) return;
    job.started = true;
    setState(image, 'loading');

    let source = job.photo.url;
    if (job.photo.thumbnailKey) {
      try {
        const blob = await loadThumbnail(job.photo.thumbnailKey);
        if (!job.active || !image.isConnected) return;
        if (blob) {
          job.objectUrl = createObjectURL(blob);
          source = job.objectUrl;
        }
      } catch { /* usa l'originale se IndexedDB non è disponibile */ }
    }

    if (!job.active || !image.isConnected) return;
    job.usingThumbnail = Boolean(job.objectUrl);
    image.src = source;
  }

  function observe(image, photo) {
    image.loading = 'lazy';
    image.decoding = 'async';
    setState(image, 'pending');

    const job = { active: true, photo, objectUrl: null, started: false, usingThumbnail: false };
    const onLoad = () => finish(image, 'loaded');
    const onError = () => {
      if (job.active && job.usingThumbnail) {
        job.usingThumbnail = false;
        releaseObjectUrl(job);
        image.src = photo.url;
        return;
      }
      finish(image, 'error');
    };
    job.onLoad = onLoad;
    job.onError = onError;
    jobs.set(image, job);
    image.addEventListener('load', onLoad);
    image.addEventListener('error', onError);

    if (observer) observer.observe(image);
    else queueMicrotask(() => start(image));
  }

  function clear() {
    observer?.disconnect();
    for (const [image, job] of jobs) {
      job.active = false;
      image.removeEventListener('load', job.onLoad);
      image.removeEventListener('error', job.onError);
      releaseObjectUrl(job);
    }
    jobs.clear();
  }

  return { observe, clear };
}
