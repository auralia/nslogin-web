/**
 * Copyright (C) 2016-2017 Auralia
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

var browserify = require("browserify");
var buffer = require("vinyl-buffer");
var del = require("del");
var gulp = require("gulp");
var source = require("vinyl-source-stream");
var sourcemaps = require("gulp-sourcemaps");
var tsify = require("tsify");
var uglify = require("gulp-uglify");

gulp.task("default", ["prod"]);

gulp.task("clean", function() {
    return del("build");
});

gulp.task("copy-html", ["clean"], function() {
    return gulp.src(["src/*.html"])
        .pipe(gulp.dest("build"))
});

gulp.task("copy-css", ["clean"], function() {
    return gulp.src(["src/css/**"])
               .pipe(gulp.dest("build/css"))
});

gulp.task("copy-third-party", ["clean"], function() {
    return gulp.src(["src/third-party/**"])
               .pipe(gulp.dest("build/third-party"))
});

gulp.task("prod", ["clean", "copy-html", "copy-css",
                   "copy-third-party"], function() {
    return browserify({
                          debug: false,
                          entries: "src/ts/main.ts",
                          extensions: [".ts"]
                      })
        .plugin(tsify)
        .bundle()
        .on("error", function(err) {
            console.error(err.message);
            this.on("end", function() {
                process.exit(1)
            });
        })
        .pipe(source("bundle.js"))
        .pipe(buffer())
        .pipe(uglify())
        .pipe(gulp.dest("build/js"));
});

gulp.task("dev", ["clean", "copy-html", "copy-css",
                  "copy-third-party"], function() {
    return browserify({
                          debug: true,
                          entries: "src/ts/main.ts",
                          extensions: [".ts"]
                      })
        .plugin(tsify)
        .bundle()
        .on("error", function(err) {
            console.error(err.message);
            this.on("end", function() {
                process.exit(1)
            });
        })
        .pipe(source("bundle.js"))
        .pipe(buffer())
        .pipe(sourcemaps.init({loadMaps: true}))
        .pipe(uglify())
        .pipe(sourcemaps.write({includeContent: false, sourceRoot: "../../"}))
        .pipe(gulp.dest("build/js"));
});
