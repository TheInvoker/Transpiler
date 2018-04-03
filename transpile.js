var watch = require('node-watch'),
    path = require('path'),
    fse = require('fs-extra'),
    klaw = require('klaw'),
    replaceExt = require('replace-ext'),
    uglifyJS = require("uglify-es"),
    minify = require('html-minifier').minify,
    sass = require('node-sass');

module.exports = function(src_list, dest_list, dest_func, header, minifyJS, minifyCSS, minifyJSON, minifyHTML, includeSASSPaths) {

    function readFile(filepath, success, fail) {
        fse.readFile(filepath, function(err, data) {
            if (err) {
                console.log(err);
                return fail();
            }
            success(data.toString());
        });  
    }

    function copyFile(src, destination, success, fail) {
        fse.copy(src, destination, function (err) {
            if (err) {
                console.log(err);
                return fail();
            }
            success();
        });   
    }

    function removeFile(filepath, success, fail) {
        fse.exists(filepath, function(exists) {
            if (exists) {
                fse.unlink(filepath,function(err){
                    if (err) {
                        console.log(err);
                        return fail();
                    }
                    success();
                });  
            } else {
                success();
            }
        });
    }

    function writeFile(destination, data, success, fail) {
        fse.outputFile(destination, data, function (err) {
            if (err) {
                console.log(err);
                return fail();
            }
            success();
        });
    }

    function processFile(evt, filepath, src_list, dest_func, header, minifyJS, minifyCSS, minifyJSON, minifyHTML, includeSASSPaths) {
        var destination = dest_func(filepath);

        if (evt == 'update') {
            
            var ext = path.extname(filepath).toLowerCase();
            var inPlugins = filepath.toLowerCase().indexOf("plugin") != -1;

            if (ext == ".pntr") { // import pointer files
                var nfilepath = fse.readFileSync(filepath).toString();
                if (fse.existsSync(nfilepath)) {
                    var onlyPath = path.dirname(filepath);
                    filepath = nfilepath;
                    ext = path.extname(filepath).toLowerCase();
                    var name = path.basename(filepath);
                    destination = dest_func(path.join(onlyPath, name));
                } else {
                    return console.log("Pointer file does not point to existing file", filepath, nfilepath);
                }
            }

            if (ext == ".js" && !inPlugins) {
                processJS(filepath, destination, minifyJS, header);
            } else if (ext == ".scss") {
                if (path.basename(filepath).startsWith("_")) {
                    console.log("SASS library file changed, processing all SASS files...");
                    processAll(/^[^_].*\.scss$/i, src_list, dest_func, header, minifyJS, minifyCSS, minifyJSON, minifyHTML, includeSASSPaths)
                } else {
                    processCSS(filepath, destination, minifyCSS, header, includeSASSPaths);
                }
            } else if (ext == ".json" && !inPlugins) {
                processJSON(filepath, destination, minifyJSON);
            } else if (ext == ".html" && !inPlugins) {
                processHTML(filepath, destination, minifyHTML)
            } else {
                copyFile(filepath, destination, function(){}, function(){});
            }
        } else if (evt == 'remove') {
            removeFile(filepath, function(){}, function(){});
        }
    }

    function processJS(filepath, destination, minifyJS, header) {
		readFile(filepath, function(str) {
			// minify it if set to
			if (minifyJS) { 
				var result = uglifyJS.minify(str);
				str = result.code;
			}
			// attach some headers
			str = '"use strict";\n\n' + header + '\n\n' + str;
			// deploy code
			writeFile(destination, str, function(){}, function(){});            
		}, function() {});
    }

    function processCSS(filepath, destination, minifyCSS, header, includeSASSPaths) {
		readFile(filepath, function(str) {
            sass.render({
                file: filepath,
                includePaths : includeSASSPaths,  // use the library folder
                outputStyle: minifyCSS ? "compressed" : "expanded", // compress if needed
                indentWidth: 4
            }, function(err, result) {
                if (err) return console.error(err);
                // get the new string
                var new_css = header + '\n\n' + result.css.toString();
                // get the css file name
                destination = replaceExt(destination, '.css');
                // deploy code
                writeFile(destination, new_css, function(){}, function(){});  
            });       
		}, function() {});
    }

    function processJSON(filepath, destination, minifyJSON) {
        readFile(filepath, function(str) {
            if (str.trim() == "") {
                // if empty, don't parse
                var json = "";
            } else {
                // read it into an object
                try {
                    var obj = JSON.parse(str);
                } catch (err) {
                    return console.log("ERROR", "\"" + err.message + "\"", filepath);
                }
                // convert to json
                var json = minifyJSON ? JSON.stringify(obj) : JSON.stringify(obj, null, 4);
            }
            // deploy it
            writeFile(destination, json, function(){}, function(){});
        }, function() {});
    }

    function processHTML(filepath, destination, minifyHTML) {
		readFile(filepath, function(str) {
            var result = minifyHTML ? minify(str, {removeAttributeQuotes:false}) : str;
            writeFile(destination, result, function(){}, function(){});
		}, function() {});  
    }

    function watchFiles(src_list, dest_func, header, minifyJS, minifyCSS, minifyJSON, minifyHTML, includeSASSPaths) {
        watch(src_list, { recursive: true }, function(evt, name) {
            console.log('%s changed with %s.', name, evt);
            processFile(evt, name, src_list, dest_func, header, minifyJS, minifyCSS, minifyJSON, minifyHTML, includeSASSPaths);
        });
        console.log("Watching...", src_list);
    }

    /**
     * Clear all destinations.
     */ 
    function clearDestination(dest_list, success) {
        console.log("Clearing all files...");
        var count = 0;
        dest_list.map(function(dest) {
            fse.remove(dest, err => {
                count++;
                if (err) {
                    console.error(err);
                }
                if (count == dest_list.length) {
                    success();
                }
            });
        });
        console.log("Cleared all files");
    }

    /**
     * Process all files.
     */
    function processAll(filter, src_list, dest_func, header, minifyJS, minifyCSS, minifyJSON, minifyHTML, includeSASSPaths) {
        console.log("Initializing...");
        src_list.map(function(src) {
            klaw(src).on('data', function (item) {
                var dir = fse.lstatSync(item.path).isDirectory();
                var filename = path.basename(item.path);
                if (!dir && filename.match(filter)) {
                    processFile('update', item.path, src_list, dest_func, header, minifyJS, minifyCSS, minifyJSON, minifyHTML, includeSASSPaths);
                }
            });
        });
    }

    clearDestination(dest_list, function() {
        processAll(/^(?!_.*\.scss$).*$/i, src_list, dest_func, header, minifyJS, minifyCSS, minifyJSON, minifyHTML, includeSASSPaths);
        watchFiles(src_list, dest_func, header, minifyJS, minifyCSS, minifyJSON, minifyHTML, includeSASSPaths);
    });
};