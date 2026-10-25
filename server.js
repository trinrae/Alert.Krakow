import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const app=express(), root=path.dirname(fileURLToPath(import.meta.url));
const PORT=process.env.PORT||3000;
app.disable('x-powered-by');app.use(express.static(path.join(root,'public')));
const cache=new Map();
async function load(url,ttl=120000){const cached=cache.get(url);if(cached&&Date.now()-cached.at<ttl)return cached.value;const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);try{const r=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'AlertKrakow/1.0 (public weather dashboard)'}});if(!r.ok)throw new Error('Source returned '+r.status);const value=await r.json();cache.set(url,{value,at:Date.now()});return value;}catch(e){if(cached)return {...cached.value,_stale:true};throw e;}finally{clearTimeout(timer)}}
const weather='https://api.open-meteo.com/v1/forecast?latitude=50.0647&longitude=19.9450&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&hourly=precipitation_probability&forecast_days=1&timezone=Europe%2FWarsaw';
const air='https://air-quality-api.open-meteo.com/v1/air-quality?latitude=50.0647&longitude=19.9450&current=pm10,pm2_5,european_aqi&timezone=Europe%2FWarsaw';
app.get('/api/status',(req,res)=>res.json({ok:true,city:'Kraków',updated:new Date().toISOString()}));
app.get('/api/weather',async(req,res)=>{try{const d=await load(weather);res.json({source:'Open-Meteo',stale:!!d._stale,current:d.current,units:d.current_units});}catch(e){res.status(502).json({error:'Weather feed unavailable'})}});
app.get('/api/air',async(req,res)=>{try{const d=await load(air,300000);res.json({source:'Open-Meteo / CAMS modeled air-quality data',stale:!!d._stale,current:d.current,units:d.current_units});}catch(e){res.status(502).json({error:'Air-quality feed unavailable'})}});
app.get('/api/sources',(req,res)=>res.json({transport:[{name:'ZTP Kraków',url:'https://ztp.krakow.pl/'},{name:'MPK Kraków',url:'https://www.mpk.krakow.pl/'},{name:'Traffic map',url:'https://www.google.com/maps/@50.0647,19.945,12z/data=!5m1!1e1'}],alerts:[{name:'IMGW weather warnings',url:'https://meteo.imgw.pl/'},{name:'RCB government alerts',url:'https://www.gov.pl/web/rcb'},{name:'Kraków city notices',url:'https://www.krakow.pl/'},{name:'GIOŚ air-quality measurements',url:'https://powietrze.gios.gov.pl/pjp/current'}],news:[{name:'Kraków city news',url:'https://www.krakow.pl/'},{name:'Radio Kraków',url:'https://www.radiokrakow.pl/'},{name:'Kraków news search',url:'https://news.google.com/search?q=Krak%C3%B3w&hl=pl&gl=PL&ceid=PL%3Apl'}]}));
app.get('*',(req,res)=>res.sendFile(path.join(root,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log('Alert.Kraków ready on '+PORT));
