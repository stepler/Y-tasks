
(function(global){
  'use strict';

  var cache = {};
 
  global.tmpl = function tmpl(str, data){
    var fn = !/\W/.test(str) ?
      cache[str] = cache[str] ||
        tmpl(document.getElementById(str).innerHTML) :
      new Function("obj",
        "var p=[],print=function(){p.push.apply(p,arguments);};" +
        "with(obj){p.push('" +
        str
          .replace(/[\r\t\n]/g, " ")
          .split("<%").join("\t")
          .replace(/((^|%>)[^\t]*)'/g, "$1\r")
          .replace(/\t=(.*?)%>/g, "',$1,'")
          .split("\t").join("');")
          .split("%>").join("p.push('")
          .split("\r").join("\\'")
      + "');}return p.join('');");
    return data ? fn( data ) : fn;
  };

  global.randomazer = function randomazer(data, length) {
    var i, j,
        item,
        gen_data = [];

    for (i=0; i<length; i++) {
      item = {};
      for (j in data) {
        item[j] = random(data[j]);
      }
      gen_data.push(item);
    }
    return gen_data;

    function random(values) {
      if (typeof values === 'function') {
        return values();
      }
      return values[Math.floor(Math.random() * values.length)]
    }
  }

})(this);

(function(){
  'use strict';

  var I = 0;
  var random_data = {
    type: ['depart', 'arrival'],
    N: function(){ return (I+=1) },
    company: [{name: '...', logo: ''}],
    plane: [ ['Boeing 737', 'B747'] ],
    from_to: [ ['Frankfurt International Airport', 'FRA'] ],
    time: ['00:00'],
    status: ['...'],
    info: ['']
  };

  var data = randomazer(random_data, 10);

  document.getElementById('online-tablo').innerHTML = 
    tmpl('online_tablo_tpl', {list: data});

  document.getElementById('tablo-info').innerHTML = 
    tmpl('info_modal_tpl', {list: data});

})();