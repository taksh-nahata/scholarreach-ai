const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
let e = fs.readFileSync(envPath, "utf8");
const set = (key, val) => {
  const line = `${key}="${val}"`;
  if (new RegExp(`^${key}=`, "m").test(e)) {
    e = e.replace(new RegExp(`^${key}=.*$`, "m"), line);
  } else {
    e += `\n${line}\n`;
  }
};

set("ALLOW_DEFAULT_USER", "false");
set("DRIP_DRY_RUN", "true");

let codeMatch = e.match(/^WORKSPACE_ACCESS_CODE="?([^\r\n"]+)/m);
if (!codeMatch || !codeMatch[1]) {
  const code = crypto.randomBytes(9).toString("base64url").slice(0, 12);
  set("WORKSPACE_ACCESS_CODE", code);
  codeMatch = [null, code];
}

fs.writeFileSync(envPath, e);
console.log(JSON.stringify({
  ALLOW_DEFAULT_USER: "false",
  DRIP_DRY_RUN: "true",
  WORKSPACE_ACCESS_CODE: codeMatch[1],
}));
