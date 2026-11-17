/* ============================================================
   WEATHER: what the sky over the mall is doing, for the 3D map (map3d.js setWeather: rain, snow, wet paving,
   drifting cloud shadows, trees in the wind, lightning) and the small chip in the kiosk header and the phone's
   welcome line.
   Where it comes from (settings.weather, Admin -> Settings -> Weather on the map):
     mode 'live'  Open-Meteo's current weather for the mall's position (free, no key, no visitor data sent:
                  only the mall's latitude and longitude), every 15 minutes; nothing is shown until it answers
     mode <kind>  fixed by the mall's team (a demo, or a screen that should always look its best)
     mode 'off'   no weather on the map and no chip
   ?weather=rain (or any kind) overrides both on this screen, for demos.
   wxFromCode() is pure (WMO weather codes -> one of WX_KINDS) and tested by tests/weather.test.js.
   ============================================================ */
const WX_KINDS=['sunny','partly','cloudy','fog','drizzle','rain','storm','snow'];
const WX_DEFAULT={mode:'live',lat:28.4595,lon:77.0266,place:'Gurugram'};   // the demo venue's city; the mall's team sets their own
/* WMO weather interpretation codes, as Open-Meteo gives them */
function wxFromCode(code){code=Number(code);
  if(!isFinite(code))return null;
  if(code===0||code===1)return 'sunny';
  if(code===2)return 'partly';
  if(code===3)return 'cloudy';
  if(code===45||code===48)return 'fog';
  if(code>=51&&code<=57)return 'drizzle';
  if((code>=61&&code<=67)||(code>=80&&code<=82))return 'rain';
  if((code>=71&&code<=77)||code===85||code===86)return 'snow';
  if(code>=95&&code<=99)return 'storm';
  return 'partly';}
/* the words for a kind (through T(): Hindi in i18n.js); a clear night is "Clear", not "Sunny" */
function wxLabel(kind,night){return ({sunny:night?'Clear':'Sunny',partly:'Partly cloudy',cloudy:'Cloudy',fog:'Fog',drizzle:'Drizzle',rain:'Rain',storm:'Thunderstorm',snow:'Snow'})[kind]||'';}
/* line icons (Lucide, ISC licence), drawn like IC */
const WXI=(()=>{const svg=p=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`,
  cl='<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.24"/>';
  return {sunny:svg('<circle cx="12" cy="12" r="4"/><path class="a" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
    night:svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>'),
    partly:svg('<path class="a" d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6z"/>'),
    cloudy:svg('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/>'),
    fog:svg(cl+'<path class="a" d="M16 17H7M17 21H9"/>'),
    drizzle:svg(cl+'<path class="a" d="M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1"/>'),
    rain:svg(cl+'<path class="a" d="M16 14v6M8 14v6M12 16v6"/>'),
    storm:svg('<path d="M6 16.33A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.97"/><path class="a" d="M13 12l-3 5h4l-3 5"/>'),
    snow:svg('<path d="M2 12h20M12 2v20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07"/><path class="a" d="M9 4l3 2 3-2M9 20l3-2 3 2M4 9l2 3-2 3M20 9l-2 3 2 3"/>')};})();
const Weather={kind:null,temp:null,wind:0,isDay:true,live:false,at:0,subs:[],timer:null,key:'',
  conf(){const s=(typeof INFO!=='undefined'&&INFO.settings&&INFO.settings.weather)||{};const c=Object.assign({},WX_DEFAULT,s);
    const lat=Number(c.lat),lon=Number(c.lon);c.lat=isFinite(lat)&&Math.abs(lat)<=90?lat:WX_DEFAULT.lat;c.lon=isFinite(lon)&&Math.abs(lon)<=180?lon:WX_DEFAULT.lon;
    const q=typeof QS!=='undefined'&&QS.get('weather');if(q&&(WX_KINDS.includes(q)||q==='off'||q==='live'))c.mode=q;
    if(c.mode!=='live'&&c.mode!=='off'&&!WX_KINDS.includes(c.mode))c.mode='live';return c;},
  on(fn){this.subs.push(fn);},
  emit(){this.subs.forEach(fn=>{try{fn(this);}catch(e){typeof reportError==='function'&&reportError(e,'weather');}});},
  set(kind,extra){this.kind=kind;Object.assign(this,extra||{});this.at=Date.now();this.emit();},
  /* (re)start: called at boot and whenever the settings change; does nothing if they have not */
  start(){const c=this.conf(),key=[c.mode,c.lat,c.lon].join('|');if(key===this.key)return;this.key=key;clearInterval(this.timer);this.timer=null;
    if(c.mode==='off'){this.set(null,{live:false,temp:null});return;}
    if(c.mode!=='live'){this.set(c.mode,{live:false,temp:null,wind:{sunny:8,partly:12,cloudy:16,fog:4,drizzle:14,rain:22,storm:45,snow:12}[c.mode],isDay:true});return;}
    this.kind=null;this.live=true;this.fetch(c);this.timer=setInterval(()=>this.fetch(this.conf()),15*60*1000);},
  async fetch(c){if(typeof fetch!=='function')return;
    try{const u='https://api.open-meteo.com/v1/forecast?latitude='+c.lat.toFixed(4)+'&longitude='+c.lon.toFixed(4)+'&current=temperature_2m,weather_code,wind_speed_10m,is_day&wind_speed_unit=kmh&timezone=auto';
      const ctl=typeof AbortController==='function'?new AbortController():null;const t=setTimeout(()=>ctl&&ctl.abort(),10000);
      const r=await fetch(u,{signal:ctl&&ctl.signal,credentials:'omit',referrerPolicy:'no-referrer'});clearTimeout(t);if(!r.ok)throw new Error('weather '+r.status);
      const j=await r.json(),cur=j&&j.current;const kind=cur&&wxFromCode(cur.weather_code);if(!kind)throw new Error('weather: no current');
      if(this.conf().mode!=='live')return;                                   // switched to a fixed look meanwhile
      const temp=Number(cur.temperature_2m),wind=Number(cur.wind_speed_10m);
      this.set(kind,{live:true,temp:isFinite(temp)?Math.round(temp):null,wind:isFinite(wind)?wind:10,isDay:cur.is_day!==0});}
    catch(e){/* offline or the service is down: keep what we had (or nothing); try again at the next tick */}},
  /* '28° Sunny' as plain words (the phone's welcome line), or '' */
  text(){if(!this.kind)return '';const night=!this.isDay||(typeof MODE!=='undefined'&&MODE==='evening');return (this.temp!==null?this.temp+'° ':'')+T(wxLabel(this.kind,night));},
  /* the chip: '28° Sunny' with its icon, or '' (no weather known, or off) */
  chipHTML(){if(!this.kind)return '';const night=!this.isDay||(typeof MODE!=='undefined'&&MODE==='evening');
    const ic=night&&this.kind==='sunny'?WXI.night:WXI[this.kind]||'';
    return `<span class="wx-chip" title="${escapeHtml(T(this.live?'Weather now':'Weather'))}">${ic}${this.temp!==null?`<b>${this.temp}°</b> `:''}${escapeHtml(T(wxLabel(this.kind,night)))}</span>`;}};
