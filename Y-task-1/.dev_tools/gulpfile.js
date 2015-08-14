/* global require */

// Core modules
var path = require('path');

// Gulp modules
var gulp = require('gulp'),
    watch = require('gulp-watch'),
    less = require('gulp-less'),
    cssmin = require('gulp-cssmin'),
    rename = require('gulp-rename'),
    runSequence = require('run-sequence');

// Variables
var ROOT_DIR = path.join(__dirname, '..'),
    STATIC_DIR = path.join(ROOT_DIR, 'static'),
    CSS_DIR = path.join(STATIC_DIR, 'css'),
    BEM_DIR = path.join(STATIC_DIR, 'bem-blocks');

/**
 * Работаем с стилями
 */

gulp.task('less', function() {
  return gulp.src(BEM_DIR+'/bem.less')
    .pipe(less())
    .pipe(cssmin())
    .pipe(rename({basename: 'style', suffix: '.min'}))
    .pipe(gulp.dest(CSS_DIR));
});

gulp.task('less-watch', function() {
  gulp.watch(BEM_DIR+'/**/*.less', ['less']);
});

/**
 * Собираем проект
 */

gulp.task('build', function(cb) {
  runSequence('less');
});

