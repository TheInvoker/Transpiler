var transpiler = require("./transpile.js");
var path = require("path");

var instance = new transpiler(["src"], function(filepath) {
    var p = path.relative("src", filepath);
    var np = path.join("public", p);
    return np;
}, "/* header */", true, true, true, true, "");