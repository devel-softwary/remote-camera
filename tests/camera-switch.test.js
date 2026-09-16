import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/camera.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
const result = await (async () => {

const init = new Function('document','window','navigator','localStorage','loadConfig','wsUrl','queryParam','setStatus','formatBytes','WebSocket','RTCPeerConnection','setTimeout', source + '\nreturn {start,switchCamera,handleCommand};');
function harness({exclusive=false, failure=false}={}) {
 const els=new Map(), tracks=[], calls=[], sent=[];let released=false, saved='';
 const document={querySelector(id){if(!els.has(id))els.set(id,{classList:{add(){},remove(){}},replaceChildren(){},append(){},addEventListener(){},play:async()=>{}});return els.get(id)},createElement(){return {}}};
 const api=init(document,{isSecureContext:true},{mediaDevices:{
  getUserMedia:async({video})=>{
   const id=video.deviceId?.exact||'back';calls.push(id);
   if(failure&&id==='front')throw Object.assign(Error('unavailable'),{name:'NotFoundError'});
   if(exclusive&&tracks.length&&(tracks.some(t=>t.readyState==='live')||!released))throw Object.assign(Error('busy'),{name:'NotReadableError'});
   const track={label:id,readyState:'live',getSettings:()=>({deviceId:id,width:1280,height:720,frameRate:30}),getCapabilities:()=>({}),stop(){this.readyState='ended'}};
   tracks.push(track);released=false;return {getTracks:()=>[track],getVideoTracks:()=>[track]};
  },enumerateDevices:async()=>['back','front'].map(deviceId=>({kind:'videoinput',deviceId,label:deviceId}))
 }},{getItem:()=>saved,setItem:(key,v)=>saved=v},async()=>({iceServers:[]}),()=>'',()=> 'test',()=>{},()=>'',class {close(){}},class {
  addTrack(){return {replaceTrack:async(t)=>sent.push(t.label)}}createDataChannel(){return {readyState:'open',send(){}}}close(){}
 },(callback)=>{released=true;callback()});
 return {api,tracks,calls,sent,saved:()=>saved};
}
function assert(value,message){if(!value)throw Error(message)}
const normal=harness();await normal.api.start();await normal.api.switchCamera('front');
assert(normal.sent.at(-1)==='front'&&normal.tracks[0].readyState==='ended','local front switch');
await normal.api.handleCommand({type:'switch-camera',deviceId:'back'});
assert(normal.sent.at(-1)==='back'&&normal.saved()==='back','remote return switch');
const exclusive=harness({exclusive:true});await exclusive.api.start();await exclusive.api.switchCamera('front');
assert(exclusive.calls.join(',')==='back,front,front'&&exclusive.sent.at(-1)==='front','exclusive device release and retry');
const failed=harness({failure:true});await failed.api.start();try{await failed.api.switchCamera('front')}catch{}
assert(failed.tracks[0].readyState==='live'&&failed.calls.join(',')==='back,front','preserve live original on failure');
return '4 regression scenarios passed';

})();
console.log(result);
