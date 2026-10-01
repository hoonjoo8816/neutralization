
const connectButton=document.querySelector('#connect'),disconnectButton=document.querySelector('#disconnect'),statusEl=document.querySelector('#status'),valueEl=document.querySelector('#value'),updated=document.querySelector('#updated'),log=document.querySelector('#log'),phValue=document.querySelector('#phValue'),phNote=document.querySelector('#phNote');
let port=null,reader=null,stopping=false,lastReceived=0,readingTask=null;
const setNumber=document.querySelector('#setNumber');
function setSignal(state){const lights=document.querySelector('#connectionLights');lights.setAttribute('data-state',state);lights.setAttribute('aria-label',state==='receiving'?'측정값 정상 수신':state==='waiting'?'연결 중 또는 측정 신호 확인 필요':'연결 안 됨');setNumber.disabled=!!port||state==='waiting'||recording;}
function setConnectionStatus(message,state){statusEl.textContent=message;setSignal(state);}
function phDisplayColor(ph){const t=Math.max(0,Math.min(14,ph))/14;return `rgb(${Math.round(198+(44-198)*t)}, ${Math.round(52+(98-52)*t)}, ${Math.round(52+(191-52)*t)})`;}
const startRecord=document.querySelector('#startRecord'),stopRecord=document.querySelector('#stopRecord'),download=document.querySelector('#download'),recordStatus=document.querySelector('#recordStatus'),recordTable=document.querySelector('#records');
let recording=false,startedAt=null,records=[],exportedCount=0,recordSegment=0;
const initialReading=document.querySelector('#initialReading'),currentReading=document.querySelector('#currentReading'),volumeDisplay=document.querySelector('#volumeDisplay'),savePoint=document.querySelector('#savePoint'),downloadPoints=document.querySelector('#downloadPoints'),pointStatus=document.querySelector('#pointStatus'),pointRows=document.querySelector('#pointRows');
let latestSample=null,points=[],exportedPointCount=0,pointRevision=0,exportedPointRevision=0,nextPointId=1,deletedPoint=null;
function readVolume(){
 const parse=input=>{const str=input.value.trim();if(!/^\d+(?:\.\d{1,2})?$/.test(str))return null;const n=Number(str);return Number.isFinite(n)&&n>=0?n:null;};
 const initial=parse(initialReading),current=parse(currentReading);
 if(initial===null||current===null)return {error:'초기·현재 눈금을 0 이상의 숫자(소수 둘째 자리까지)로 입력하세요.'};
 if(current<initial)return {error:'현재 눈금은 초기 눈금보다 작을 수 없습니다.'};
 const volume=Math.round((current-initial)*100)/100;
 if(points.length&&volume<points[points.length-1].volume)return {error:'현재 눈금이 이전 측정점보다 작습니다. 눈금을 확인하세요.'};
 return {initial,current,volume};
}
function refreshPoints(){
 const v=readVolume();volumeDisplay.textContent='누적 투입 부피: '+(v.error?'—':v.volume.toFixed(2))+' mL';
 savePoint.disabled=!recording||!!v.error||!latestSample||latestSample.temperature===null||Date.now()-latestSample.receivedAt>6000;
 downloadPoints.disabled=recording||!points.length;
}
initialReading.oninput=currentReading.oninput=()=>{refreshPoints();const v=readVolume();pointStatus.textContent=v.error||'누적 투입 부피 '+v.volume.toFixed(2)+' mL · 값이 안정되면 측정점을 저장하세요.';};
function pointsCSV(){
 const header=[...profileHeaders,'세트 번호','번호','저장 시각(노트북 현지 시간)','센서 수신 시각(노트북 현지 시간)','시작 후 경과(초)','초기 눈금(mL)','현재 눈금(mL)','누적 투입 부피(mL)','온도(℃)','pH','pH 원시값','측정 상태','관찰 색깔','투입 후 경과(초)'];
 const rows=points.map((p,i)=>[...profileValues(),p.setNumber,p.id,p.time,p.sampleTime,p.elapsed.toFixed(3),p.initial.toFixed(2),p.current.toFixed(2),p.volume.toFixed(2),p.temperature.toFixed(2),p.ph.toFixed(2),p.raw.toFixed(1),p.state,p.color,p.waitSeconds===null?'':p.waitSeconds.toFixed(1)]);
 return '\uFEFF'+[header,...rows].map(row=>row.map(value=>'"'+safeCSV(value).replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
}
savePoint.onclick=()=>{
 refreshPoints();if(savePoint.disabled)return;
 const volume=readVolume(),now=new Date(),point={...volume,...latestSample,time:localTimestamp(now),sampleTime:localTimestamp(new Date(latestSample.receivedAt)),elapsed:(now.getTime()-startedAt)/1000,id:nextPointId++,setNumber:Number(setNumber.value),color:document.querySelector('#solutionColor').value.trim()||'미기록',waitSeconds:timerElapsed(),state:latestSample.outside?'pH 보정 범위 밖':'보정 범위 내'};
 points.push(point);pointRevision++;deletedPoint=null;document.querySelector('#undoDelete').hidden=true;initialReading.disabled=true;renderVolumeCharts();
 renderPointsTable();
 pointStatus.textContent=point.id+'번 측정점 저장 · '+point.volume.toFixed(2)+' mL · pH '+point.ph.toFixed(2);refreshPoints();
};
downloadPoints.onclick=()=>{if(recording||!points.length)return;const url=URL.createObjectURL(new Blob([pointsCSV()],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='neutralization_points_'+localTimestamp(new Date(startedAt)).replace(/[: .]/g,'-')+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);exportedPointCount=points.length;exportedPointRevision=pointRevision;};
function refreshRecording(message){
 startRecord.disabled=recording||!lastReceived;
 startRecord.textContent=records.length?'기록 재개':'기록 시작';
 stopRecord.disabled=!recording;download.disabled=recording||!records.length;
 recordStatus.textContent=(message||(recording?'기록 중':records.length?'기록 종료':'기록 대기'))+' · '+records.length+'개';refreshPoints();setNumber.disabled=recording||!!port;
}
function stopRecording(message){recording=false;refreshRecording(message);}
function localTimestamp(date){const pad=(n,width=2)=>String(n).padStart(width,'0');return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+' '+pad(date.getHours())+':'+pad(date.getMinutes())+':'+pad(date.getSeconds())+'.'+pad(date.getMilliseconds(),3);}
function csvText(){
 const header=[...profileHeaders,'세트 번호','번호','측정 시각(노트북 현지 시간)','시작 후 경과(초)','온도(℃)','pH','pH 원시값','측정 상태'];
 const rows=records.map((r,i)=>[...profileValues(),r.setNumber,i+1,r.time,r.elapsed.toFixed(3),r.temperature===null?'':r.temperature.toFixed(2),r.ph.toFixed(2),r.raw.toFixed(1),r.state]);
 const escape=value=>'"'+safeCSV(value).replace(/"/g,'""')+'"';
 return '\uFEFF'+[header,...rows].map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n';
}
function recordSample(temperature,ph,raw,outside){
 if(!recording)return;
 const now=new Date(),state=[temperature===null?'온도센서 오류':'',outside?'pH 보정 범위 밖':''].filter(Boolean).join(' / ')||'보정 범위 내';
 const r={time:localTimestamp(now),elapsed:(now.getTime()-startedAt)/1000,segment:recordSegment,setNumber:Number(setNumber.value),temperature,ph,raw,state};records.push(r);
 const tr=document.createElement('tr');
 for(const value of [records.length,shortTime(r.time),r.elapsed.toFixed(1),temperature===null?'—':temperature.toFixed(2),ph.toFixed(2),state]){const td=document.createElement('td');td.textContent=String(value);tr.appendChild(td);}
 recordTable.prepend(tr);while(recordTable.children.length>5)recordTable.lastElementChild.remove();refreshRecording();renderTimeCharts();
}
startRecord.onclick=()=>{if(!lastReceived||Date.now()-lastReceived>6000)return;if(startedAt===null)startedAt=Date.now();recordSegment++;recording=true;refreshRecording();};
stopRecord.onclick=()=>stopRecording();
download.onclick=()=>{if(recording||!records.length)return;const url=URL.createObjectURL(new Blob([csvText()],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='neutralization_live_'+localTimestamp(new Date(startedAt)).replace(/[: .]/g,'-')+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);exportedCount=records.length;};
window.addEventListener('beforeunload',event=>{if(recording||records.length>exportedCount||pointRevision!==exportedPointRevision){event.preventDefault();event.returnValue='';}});

function clearValue(){latestSample=null;valueEl.innerHTML='— <small>℃</small>';phValue.textContent='—';phValue.style.color='';setSignal(port?'waiting':'disconnected');phNote.textContent='pH 4~10 기준으로 보정한 값입니다.';lastReceived=0;if(recording)stopRecording('수신 중단으로 기록 종료');else refreshRecording();}
function processLine(line){
 log.textContent=(log.textContent+'\n'+line).split('\n').slice(-12).join('\n');
 const m=/^Temperature:\s*(-?\d+(?:\.\d+)?\s*C|Sensor not detected)\s*\|\s*pH:\s*(-?\d+(?:\.\d+)?)\s*\|\s*raw:\s*(\d+(?:\.\d+)?)(?:\s*\|\s*Outside calibration range)?\s*$/.exec(line);
 if(!m){if(line.startsWith('Temperature:')){clearValue();setConnectionStatus('측정 데이터 형식이 다릅니다. pH·온도 코드를 확인하세요.','waiting');}return;}
 const ph=Number(m[2]),raw=Number(m[3]);
 if(!Number.isFinite(ph)||!Number.isFinite(raw)||raw<0||raw>1023){clearValue();setConnectionStatus('측정 신호를 확인하세요.','waiting');return;}
 const temperature=parseFloat(m[1]);
 if(m[1]==='Sensor not detected'||!Number.isFinite(temperature)||temperature < -55||temperature >125){valueEl.innerHTML='— <small>℃</small>';setConnectionStatus('pH 수신 중 · 온도센서 배선을 확인하세요.','waiting');}
 else{valueEl.innerHTML=temperature.toFixed(2)+' <small>℃</small>';setConnectionStatus('pH와 온도값을 받고 있습니다.','receiving');}
 phValue.textContent=ph.toFixed(2);phValue.style.color=phDisplayColor(ph);
 phNote.textContent=(line.includes('Outside calibration range')||ph<4||ph>10)?'보정 범위(4~10) 밖의 추정값입니다.':'pH 4~10 기준으로 보정한 값입니다.';
 lastReceived=Date.now();updated.textContent='마지막 수신: '+new Date().toLocaleTimeString('ko-KR');
 const outside=line.includes('Outside calibration range')||ph<4||ph>10;
 latestSample={receivedAt:lastReceived,temperature:Number.isFinite(temperature)&&temperature>=-55&&temperature<=125?temperature:null,ph,raw,outside};
 recordSample(latestSample.temperature,ph,raw,outside);refreshRecording();
}
async function readLoop(){let buffer='';const decoder=new TextDecoder();try{reader=port.readable.getReader();while(!stopping){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop();for(const line of lines)processLine(line.trim());if(buffer.length>4096){buffer='';setConnectionStatus('데이터 형식을 확인하세요. 통신 속도는 9600입니다.','waiting');}}}catch(e){if(!stopping)setConnectionStatus('통신이 중단됐습니다. USB 연결을 확인하고 다시 연결하세요.','disconnected');}finally{if(reader){reader.releaseLock();reader=null;}try{await port.close();}catch{}port=null;connectButton.disabled=false;disconnectButton.disabled=true;clearValue();updated.textContent='연결이 해제되었습니다.';if(stopping)setConnectionStatus('연결을 해제했습니다.','disconnected');else if(!statusEl.textContent.includes('중단'))setConnectionStatus('연결이 종료되었습니다. 다시 연결하세요.','disconnected');}}
connectButton.onclick=async()=>{connectButton.disabled=true;stopping=false;clearValue();setConnectionStatus('기기를 선택하고 연결을 기다리고 있습니다.','waiting');log.textContent='';updated.textContent='아직 받은 측정값이 없습니다.';try{port=await navigator.serial.requestPort();await port.open({baudRate:9600});setConnectionStatus('연결됐습니다. 아두이노가 시작되면 pH와 온도가 표시됩니다.','waiting');disconnectButton.disabled=false;readingTask=readLoop();}catch(e){if(port){try{await port.close();}catch{}port=null;}connectButton.disabled=false;setConnectionStatus(e.name==='NotFoundError'?'기기 선택을 취소했습니다.':'연결하지 못했습니다. 시리얼 모니터를 닫고 USB 연결을 확인하세요.','disconnected');}};
disconnectButton.onclick=async()=>{disconnectButton.disabled=true;stopping=true;stopRecording('연결 해제로 기록 종료');if(reader)try{await reader.cancel();}catch{}if(readingTask)await readingTask;};
setInterval(()=>{refreshPoints();if(lastReceived&&Date.now()-lastReceived>6000){clearValue();setConnectionStatus('6초 이상 새 측정값이 없습니다. 연결을 확인하세요.','waiting');updated.textContent='수신 중단';}},1000);
if(!('serial' in navigator)||!window.isSecureContext){connectButton.disabled=true;setConnectionStatus('최신 Google Chrome에서 HTTPS 웹주소 또는 로컬 실행 파일을 열어주세요.','disconnected');}
