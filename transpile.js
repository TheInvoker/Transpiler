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
        fse.readFile(filepath, function read(err, data) {
            if (err) {
                console.log(err);
                return fail(err);
            }
            success(data.toString());
        });  
    }

    function copyFile(src, destination, success, fail) {
        fse.copy(src, destination, function (err) {
            if (err) {
                console.log(err);
                return fail(err);
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
                        return fail(err);
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
                return fail(err);
            }
            success();
        });
    }

    function processFile(evt, filepath, dest_func, minifyJS, minifyCSS, minifyJSON, minifyHTML, header, includeSASSPaths) {
        var destination = dest_func(filepath);

        if (evt == 'update') {
            var ext = path.extname('index.html').toLowerCase();
            var inPlugins = filepath.toLowerCase().indexOf("plugin") != -1;

            if (ext == ".js" && !inPlugins) {
                processJS(filepath, destination, minifyJS, header);
            } else if (ext == ".scss" && !inPlugins) {
                processCSS(filepath, destination, minifyCSS, header, includeSASSPaths);
            } else if (ext == ".json") {
                processJSON(filepath, destination, minifyJSON);
            } else if (ext == ".html") {
                processHTML(filepath, destination, minifyHTML)
            } else {
                copyFile(filepath, destination, function(){}, function(){});
            }
        } else if (evt == 'remove') {
            removeFile(filepath, success, fail);
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
                filepath = replaceExt(filepath, '.css');
                // deploy code
                writeFile(destination, new_css, function(){}, function(){});  
            });       
		}, function() {});
    }

    function processJSON(filepath, destination, minifyJSON) {
        readFile(filepath, function(str) {
            // read it into an object
            var obj = JSON.parse(str);
            // convert to json
            var json = minifyJSON ? JSON.stringify(obj) : JSON.stringify(obj, null, 4);
            // deploy it
            writeFile(destination, json, function(){}, function(){});
        }, function() {});
    }

    function processHTML(filepath, destination, minifyHTML) {
		readFile(filepath, function(str) {
            var result = minifyHTML ? minify(str) : str;
            writeFile(destination, result, function(){}, function(){});
		}, function() {});  
    }

    function watchFiles() {
        watch(src_list, { recursive: true }, function(evt, name) {
            console.log('%s changed with %s.', name, evt);
            processFile(evt, name, dest_func, minifyJS, minifyCSS, minifyJSON, minifyHTML, header, includeSASSPaths);
        });
        console.log("Watching", src_list);
    }

    // delete the destination folder
    function clearDestination(success) {
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
    }

    function processAll() {
        console.log("Initializing...");
        src_list.map(function(src) {
            klaw(src).on('data', function (item) {
                var dir = fse.lstatSync(item.path).isDirectory();
                if (!dir) {
                    console.log("Processing", item.path);
                    processFile('update', item.path, dest_func, minifyJS, minifyCSS, minifyJSON, minifyHTML, header, includeSASSPaths);
                }
            });
        });
    }

    clearDestination(function() {
        processAll();
        watchFiles();
    });
};