
(function(){
  'use strict';

  /**
   * BOOTSTRAP
   */

  // >>> Полифил requestAnimationFrame от Пола Айриша
  (function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame']
                                   || window[vendors[x]+'CancelRequestAnimationFrame'];
    }
 
    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); },
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
 
    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
  }());
  // <<<

  // >>> Полифил isArray
  if (!Array.isArray) {
    Array.isArray = function(arg) {
      return Object.prototype.toString.call(arg) === '[object Array]';
    };
  }
  // <<<

  /**
   * APPLICATION
   */

  // Глобальные константы
  // В теории можно и без них обойтись, но с ними в этом задании проще
  var WIDTH = 530,
      HEIGHT = 100,
      FPS = 16.666;


  // Объект для композиции (песни)
  // Содержит информацию о коппозиции. Источником служит файл
  var Song = function(file) {
    this.source_file = file;
    this.info = null;
    this.buffer = null;
    this.waveform = null;
    this.duration = 0;
  }

  Song.prototype = {

    // Отдаем АудиоБуфер через промис
    // АудиоБуфер читается из файла
    get_buffer: function() {
      var self = this;

      if (this.buffer) {
        return this.buffer;
      }

      this.buffer = new Promise((function(resolve, reject) {

        var reader = new FileReader();
        reader.onload = function() {

          var audio = new (window.AudioContext || window.webkitAudioContext)();
          audio.decodeAudioData(reader.result, function(buffer) {
            self.duration = buffer.duration;
            self.buffer.isPending = false;
            resolve(buffer);
          }, reject);
          audio.close();

        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(this.source_file);

      }).bind(this));

      this.buffer.isPending = true;

      return this.buffer;
    },

    get_duration: function() {
      return this.duration;
    },

    // Отдаем Waveform через промис
    get_waveform: function(width) {
      if (this.waveform) {
        return this.waveform;
      }

      this.waveform = new Promise((function(resolve, reject){
        this.get_buffer().then((function(buffer) {
          var i, j, val, m2, m1, max, channel, step, inc, length, data,
              peaks = [];

          step = Math.ceil(buffer.length / width);
          inc = Math.ceil(step / 10) || 1;
          length = Math.ceil(buffer.length / step);

          for (channel=0; channel<buffer.numberOfChannels; channel++) {
            data = buffer.getChannelData(channel);
            peaks[channel] = [];
            for (i=0; i<length; i++) {
              max = 0;
              for (j=0; j<step; j+=inc) {
                val = data[step*i+j];
                if (val > max || -val > max) {
                  max = val < 0 ? -val : val ;
                }
              }

              m2 = peaks[channel][i-2];
              m1 = peaks[channel][i-1];
              if (m2 && m1) {
                peaks[channel][i-1] = (max+m2+m1)/3;
              }

              peaks[channel][i] = max;
            }
          }

          resolve(peaks);
        }).bind(this), reject);
      }).bind(this));

      return this.waveform;
    },

    // Отдаем Meta-информацию о песне.
    // Использую стороннее решение, т.к. те же ID3-тэги имеют несколько версий...
    // ... и писать ридер для всех них это отдельная достаточно большая задача
    get_info: function() {
      if (this.info) {
        return this.info;
      }

      this.info = new Promise((function(resolve, reject){
        var tmpId = (new Date()).getTime+Math.random();
        ID3.loadTags(tmpId, function() {
          var tags = ID3.getAllTags(tmpId);
          tags.title = tags.title || 'Unknown title';
          tags.artist = tags.artist || 'Unknown artist';
          resolve(tags); 
        },{
          dataReader: FileAPIReader(this.source_file),
          tags: ['title', 'artist']
        });
      }).bind(this));

      return this.info;
    }
  };

  // Объект плейлиста
  // Управляет списком помпозиций и очередностью их воспроизведения
  var Playlist = function() {
    this.reset();
  }

  Playlist.prototype = {

    reset: function() {
      this.list = [];
      this.active = 0;
    },

    add: function(song) {
      this.list.push(song);
    },

    get: function() {
      return this.list[this.active];
    },

    next: function() {
      this.active = this.get_active(this.active + 1);
      return this.get();
    },

    prev: function() {
      this.active = this.get_active(this.active - 1);
      return this.get();
    },

    get_active: function(index) {
      if (index < 0) { 
        return this.list.length-1; 
      }
      if (index >= this.list.length) {
        return 0;
      }
      return index;
    }
  };
  
  // Непосредственно сам плеер
  // Осушествляет воспроизведение композиции
  // Фильтрует вывод (для того же эквалайзера)
  var Player = function () {
    this.reset();
  };

  Player.prototype = {

    /**
     * https://github.com/jeromeetienne/microevent.js
     * Копия MicroEvent >>>
     */
    bind: function(event, fct){
      this._events = this._events || {};
      this._events[event] = this._events[event] || [];
      this._events[event].push(fct);
    },
    unbind : function(event, fct){
      this._events = this._events || {};
      if( event in this._events === false  )  return;
      this._events[event].splice(this._events[event].indexOf(fct), 1);
    },
    trigger : function(event /* , args... */){
      this._events = this._events || {};
      if( event in this._events === false  )  return;
      for(var i = 0; i < this._events[event].length; i++){
        this._events[event][i].apply(this, Array.prototype.slice.call(arguments, 1));
      }
    },
    // <<< Копия MicroEvent 

    reset: function() {
      this.audio = null;
      this.source = null;
      this.playlist = new Playlist();
      this.active_song = null;
      this.active_song_offset = 0;
      this.eq = 'normal';
    },

    add: function(files) {
      var i, file;
      if (!(files instanceof FileList || Array.isArray(files))) {
        return this.add([files]);
      }

      for (i = 0; i < files.length; i++) {
        file = files[i];
        if (file instanceof File) {
          this.playlist.add(new Song(file));
        }
      }
      this.trigger('player.add', files);
    },

    process: function(type, song) {
      var song_buffer, 
          self = this;

      if (!song && !this.active_song) {
        this.trigger('player.no_songs');
        return;
      }

      if (type === 'play') {
        this.active_song_offset = 0;
      }
      if (type === 'pause' || type === 'eq_update') {
        this.active_song_offset += this.audio && this.audio.currentTime || 0;
      }
      if (type === 'resume' && !this.active_song) {
        type = 'play';
      }
      if (type === 'stop') {
        this.active_song_offset = 0;
        this.active_song = null;
      }

      // перед любыми действиями останавливаем текущий процесс
      if (this.source) {
        this.source.onended = function(){}
        this.source.stop();
        this.source = null;
      }
      if (this.audio) {
        this.audio.close();
        this.audio = null;
      }

      // если мы стопорим процесс, то просты вызываем триггер и выходим ...
      if (type === 'pause' || type === 'stop') {
        this.trigger('player.'+type);
        return;
      }
      // ... если начинаем проигрывание новой есни, треггерим остановку текущей ...
      if (type === 'play' && !this.is_active(song)) {
        this.trigger('player.stop');
      }

      this.active_song = song;

      // ... иначе запрашиваем буфер ...
      song_buffer = song.get_buffer();
      if (song_buffer.isPending) {
        this.trigger('player.loading', song);
      }

      song_buffer.then((function(buffer) {
        var i, filter, prev_filter, filters;

        // смотрим, что во время загрузки не сменилась песня
        if (!this.is_active(song)) {
          return;
        }

        this.audio = new (window.AudioContext || window.webkitAudioContext)();
        this.source = this.audio.createBufferSource();

        filters = this.equalizer.filters(this.eq);
        if (filters.length) {
          for (i=0; i<filters.length; i++) {
            filter = this.audio.createBiquadFilter();
            filter.type = filters[i].type;
            filter.gain.value = filters[i].gain;
            filter.frequency.value = filters[i].frequency;
            
            if (prev_filter) {
              prev_filter.connect(filter);
            }
            else {
              this.source.connect(filter);
            }

            prev_filter = filter;
          }
          prev_filter.connect(this.audio.destination);
        }
        else {
          this.source.connect(this.audio.destination);
        }

        this.source.buffer = buffer;
        this.source.start(0, this.active_song_offset);
        this.source.onended = this.next.bind(this);

        this.trigger('player.'+type, song);

      }).bind(this));
    },

    play: function() {
      this.process('resume', this.playlist.get());
    },

    pause: function() {
      this.process('pause');
    },

    next: function() {
      this.process('play', this.playlist.next());
    },

    prev: function() {
      this.process('play', this.playlist.prev());
    },

    is_active: function(song) {
      return this.active_song === song;
    },

    set_eqalizer: function(value) {
      this.eq = value;
      this.process('eq_update', this.playlist.get());
    },

    get_eqalizer: function() {
      return this.eq;
    },

    // Реализация эквалайзера
    // Отдает настройки фильтров для того или итого стиля звучания
    equalizer: {
      options: [
        {f: 32,   type: 'lowshelf'}, 
        {f: 64,   type: 'peaking'}, 
        {f: 125,  type: 'peaking'}, 
        {f: 250,  type: 'peaking'}, 
        {f: 500,  type: 'peaking'}, 
        {f: 1000, type: 'peaking'}, 
        {f: 2000, type: 'peaking'}, 
        {f: 4000, type: 'peaking'}, 
        {f: 8000, type: 'peaking'}, 
        {f: 16000,type: 'highshelf'}
      ],

      presets: {
        normal: [0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000],
        classic: [0.0000, 0.0000, 0.0000, 0.0000, 0.0000, 0.0000, -4.3200, -4.3200, -4.3200, -5.7600],
        pop: [0.9600, 2.8800, 4.3200, 4.8000, 3.3600, 0.0000, -1.4400, -1.4400, 0.9600, 0.9600],
        rock: [4.8000, 2.8800, -3.3600, -4.8000, -1.9200, 2.4000, 5.2800, 6.7200, 6.7200, 6.7200],
        jazz: [3.8000, 2.8800, 1.4800, 2.6000, -1.8200, -1.6000, 0.0000, 1.4800, 2.8800, 3.7200]
      },

      filters: function(value) {
        var i,
            values = this.presets[value] || [],
            filters = [];

        for (i=0; i<values.length; i++) {
          filters.push({
            type: this.options[i].type,
            gain: values[i],
            frequency: this.options[i].f,
          });
        }
        return filters;
      }
    }
  };

  // Морда приложения
  // Рендерит плеер в указанную ноду, отображает состояние плеера...
  // ... проксирует управление с элементов интерфейса в приложение
  // Работаем на основе шаблона (присутствует в html)
  var Render = function(node, template) {
    node = node instanceof HTMLElement ? node : document.getElementById(node) ;
    template = template instanceof HTMLElement ? template : document.getElementById(template) ;
    if (!(node || template)) {
      return console.error('WebAudioPlayer. Unable to get "node" or "template" elements');
    }

    this._player = this.PL = new Player();

    this.el = node;
    this.render(template.innerHTML)
  }

  Render.prototype = {
    render: function(template) {
      this.el.innerHTML = template;

      this.player();
      this.dropzone();
      this.equalizer();
      this.waveform();
    },

    // >>> Чтобы без jQuery
    find: function(selector) {
      return this.el.querySelectorAll(selector);
    },

    findOne: function(selector) {
      return this.el.querySelector(selector);
    },

    on: function(nodes, event, callback) {
      var i;
      if (!(nodes instanceof NodeList || Array.isArray(nodes))) {
        nodes = [nodes];
      }
      for (i=0; i<nodes.length; ++i) {
        nodes[i].addEventListener(event, callback);
      }
    },

    css: function(nodes, key, value) {
      var i;
      if (!(nodes instanceof NodeList || Array.isArray(nodes))) {
        nodes = [nodes];
      }
      for (i=0; i<nodes.length; ++i) {
        nodes[i].style[key] = value;
      }
    },

    attr: function(nodes, key, value) {
      var i;
      if (!(nodes instanceof NodeList || Array.isArray(nodes))) {
        nodes = [nodes];
      }
      for (i=0; i<nodes.length; ++i) {
        nodes[i][key] = value;
      }
    },

    html: function(nodes, html) {
      var i;
      if (!(nodes instanceof NodeList || Array.isArray(nodes))) {
        nodes = [nodes];
      }
      for (i=0; i<nodes.length; ++i) {
        nodes[i].innerHTML = html;
      }
    },

    visible: function(node) {
      return node.style.display !== "none";
    },
    // <<<

    player: function() {
      var self = this,
          player = this.PL,
          info_tpl = '<b>%title%</b> - %artist%',
          node_info = this.findOne('.js-player-info'),
          btn_preload = this.findOne('.js-player-preload'),
          btn_play = this.findOne('.js-player-play'),
          btn_pause = this.findOne('.js-player-pause'),
          btn_prev = this.findOne('.js-player-prev'),
          btn_next = this.findOne('.js-player-next');

      player.bind('player.add', player.play.bind(player)); // старт при добавлении песен
      this.on(btn_play, 'click', player.play.bind(player));
      this.on(btn_pause,'click', player.pause.bind(player));
      this.on(btn_prev, 'click', player.prev.bind(player));
      this.on(btn_next, 'click', player.next.bind(player));

      player.bind('player.loading', preload_status);
      player.bind('player.play', play_status);
      player.bind('player.resume', play_status);
      player.bind('player.stop', stop_status);
      player.bind('player.pause', stop_status);

      player.bind('player.play', function(song) {
        song.get_info().then(function(song_info) {
          if (player.is_active(song)) {
            self.html(node_info, interpolate(info_tpl, song_info));
          }
        })
      });

      function preload_status() {
        self.css(btn_play, 'display', 'none');
        self.css(btn_pause, 'display', 'none');
        self.css(btn_preload, 'display', '');
      };
      function play_status() {
        self.css(btn_play, 'display', 'none');
        self.css(btn_pause, 'display', '');
        self.css(btn_preload, 'display', 'none');
      };
      function stop_status() {
        self.css(btn_play, 'display', '');
        self.css(btn_pause, 'display', 'none');
        self.css(btn_preload, 'display', 'none');
      };
      function interpolate(tpl, data) {
        var i;
        for (i in data) {
          tpl = tpl.replace('%'+i+'%', data[i]);
        }
        return tpl;
      }
    },

    dropzone: function() {
      var self = this,
          player = this.PL,
          select = this.findOne('.js-select'),
          dropzone = this.findOne('.js-dropzone'),
          dropzone_class = dropzone.className;

      this.on(dropzone, 'drop', function(e) {
        e.stopPropagation(); e.preventDefault();
        player.add(e.dataTransfer.files);
        self.attr(dropzone, 'className', dropzone_class);
      });

      this.on(dropzone, 'dragover', function(e) {
        e.stopPropagation(); e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        self.attr(dropzone, 'className', dropzone_class+' hover');
      });

      this.on(dropzone, 'dragleave', function(e) {
        e.stopPropagation(); e.preventDefault();
        self.attr(dropzone, 'className', dropzone_class);
      });

      this.on(select, 'change', function(e) {
        e.stopPropagation(); e.preventDefault();
        player.add(e.target.files);
      });
    },

    equalizer: function() {
      var self = this,
          player = this.PL,
          eq_btn = this.findOne('.js-equalizer-btn'),
          eq_list = this.findOne('.js-equalizer-list'),
          eq_value = this.findOne('.js-equalizer-value');

      this.on(eq_btn, 'click', function() {
        self.css(eq_list, 'display', (self.visible(eq_list) ? 'none' : 'block' ));
      });

      this.on(eq_list, 'click', function(e) {
        var value = e.target && e.target.dataset && e.target.dataset.type || 'normal';
        player.set_eqalizer(value);
        self.css(eq_list, 'display', 'none');
      });

      player.bind('player.eq_update', function(value) {
        self.html(eq_value, player.get_eqalizer());
      });

      this.html(eq_value, player.get_eqalizer());
    },

    waveform: function() {
      var self = this,
          player = this.PL,
          timer_width = 0,
          timer_step = 0,
          timer_interval,
          timer_timestamp,
          timer = this.findOne('.js-waveform-timer'),
          canvas_1 = this.findOne('.js-waveform-canvas1'),
          canvas_2 = this.findOne('.js-waveform-canvas2');

      canvas_1.width = WIDTH;
      canvas_1.height = HEIGHT;
      canvas_2.width = WIDTH;
      canvas_2.height = HEIGHT;

      player.bind('player.play', function(song) {
        song.get_waveform(WIDTH).then(draw);

        timer_width = 0;
        timer_step = WIDTH / (song.get_duration()*1000/FPS);
        cancelAnimationFrame(timer_interval);
        timer_interval = requestAnimationFrame(process);
      });

      player.bind('player.resume', function(song) {
        timer_interval = requestAnimationFrame(process);
      });

      player.bind('player.pause', function() {
        cancelAnimationFrame(timer_interval);
        timer_timestamp = null;
      });

      player.bind('player.stop', function() {
        cancelAnimationFrame(timer_interval);
        timer_timestamp = null;
      });

      function draw(waveform) {
        var i, j, length,
            middle = HEIGHT/2,
            ctx1 = canvas_1.getContext("2d"),
            ctx2 = canvas_2.getContext("2d");
        
        ctx1.clearRect(0, 0, WIDTH, HEIGHT);
        ctx2.clearRect(0, 0, WIDTH, HEIGHT);
        ctx1.strokeStyle = 'rgb(100, 100, 100)';
        ctx2.strokeStyle = 'rgb(212, 63, 58)';

        ctx1.beginPath();
        ctx2.beginPath();
        for (i=0; i<waveform.length; i++) {
          length = waveform[i].length;
          for (j=0; j<length; j++) {
            ctx1.moveTo(j+0.5, middle-middle*waveform[i][j]);
            ctx1.lineTo(j+0.5, middle+middle*waveform[i][j]);

            ctx2.moveTo(j+0.5, middle-middle*waveform[i][j]);
            ctx2.lineTo(j+0.5, middle+middle*waveform[i][j]);
          }
        }
        ctx1.stroke();
        ctx2.stroke();
      }

      function process(timestamp) {
        if (!timer_timestamp) {
          timer_timestamp = timestamp;
        }

        var progress = (timestamp - timer_timestamp) / FPS;
        timer_timestamp = timestamp;
        timer_width += timer_step * progress;
        timer.style.width = timer_width+'px';

        if (timer_width <= WIDTH) {
          timer_interval = requestAnimationFrame(process);
        }
      }
    }
  };

  // Отдаем плеер наружу
  window.WebAudioPlayer = Render;

})();
