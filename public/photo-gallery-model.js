export function queuedGalleryPhotos(captures, project, areaId) {
  if (!(captures instanceof Map) || !project || !areaId) return [];
  return [...captures.entries()]
    .filter(([, item]) => item?.context?.project === project && item?.area?.id === areaId)
    .map(([requestId, item]) => ({
      id: `queued:${requestId}`,
      captureId: requestId,
      pending: true,
      previewUrl: item.previewUrl || '',
      createdAt: item.createdAt || '',
      width: item.width || 0,
      height: item.height || 0,
      size: item.size || 0
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
