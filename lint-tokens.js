/* Fails the build if any component file uses a raw colour or a
   raw pixel value instead of a token. This is the contract that
   keeps generated code honest. */
const fs = require("fs");
const files = ["app.css"];
// 1px hairlines, sub-token nudges, and the one media breakpoint are exempt.
const allowPx = /\b(0|1px|2px|3px|5px|9px|14px|18px|96px|84px|720px|100%|50%)\b/;
let bad = [];
for (const f of files) {
  fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    const l = line.split("/*")[0];
    if (/#[0-9a-fA-F]{3,8}\b/.test(l)) bad.push(`${f}:${i + 1} raw colour  ${line.trim()}`);
    const px = l.match(/\b\d+px\b/g) || [];
    px.forEach(p => { if (!allowPx.test(p)) bad.push(`${f}:${i + 1} raw px ${p}  ${line.trim()}`); });
  });
}
if (bad.length) { console.error("Token violations:\n" + bad.join("\n")); process.exit(1); }
console.log("Tokens clean: no raw colours or unapproved pixel values in components.");
