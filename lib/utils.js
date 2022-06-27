const path = require('path');

function sanitizePath(p) {
  // Both EXT4 and NTFS are happy with simpler filtering...
  return p.replaceAll(path.sep, '_');
  // ...But Windows may imposes stricter rules
  //return p.replaceAll(path.sep, '_').replaceAll(/[<>:"\/\\|?*]/g, '_');
}

module.exports = {
  sanitizePath,
}
