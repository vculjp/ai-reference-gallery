"use strict";
// POSE-DB-02 uses exactly the same 1,439 IDs as the existing pose catalog.
// Reuse its names and angles without duplicating 1,439 metadata records.
window.DEPTH_GALLERY_CATALOG = (window.POSE_GALLERY_CATALOG || []).map((pose) => ({
  ...pose,
  type: "depth",
  relatedPoseId: pose.id,
  thumbnail: `img/depth/thumbs/${pose.id}.jpg`,
  original: `img/depth/original/${pose.id}.png`
}));
