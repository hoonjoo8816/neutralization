// 측정 대기 기준 시간은 여기에서 초 단위로 설정합니다.
const MEASUREMENT_WAIT_SECONDS = 60;
let timerStartedAt=null,timerAccumulatedMs=0,timerCycleStartedAt=null;
function timerElapsed(){return timerCycleStartedAt===null?null:(timerAccumulatedMs+(timerStartedAt===null?0:performance.now()-timerStartedAt))/1000;}
function timerIsRunning(){return timerStartedAt!==null;}
function timerChanged(){renderTimer();if(typeof markSessionChanged==='function')markSessionChanged();if(typeof updateStudentGuidance==='function')updateStudentGuidance();}
function startTimer(){if(timerIsRunning())return;if(timerCycleStartedAt===null)timerCycleStartedAt=Date.now();timerStartedAt=performance.now();timerChanged();}
function stopTimer(){if(!timerIsRunning())return;timerAccumulatedMs+=performance.now()-timerStartedAt;timerStartedAt=null;timerChanged();}
function resetTimer(){timerStartedAt=null;timerAccumulatedMs=0;timerCycleStartedAt=null;timerChanged();}
function renderTimer(){
 const seconds=timerElapsed(),running=timerIsRunning(),target=MEASUREMENT_WAIT_SECONDS/60;
 document.querySelector('#timerDisplay').textContent=seconds===null?'00:00':String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(Math.floor(seconds%60)).padStart(2,'0');
 document.querySelector('#timerNote').textContent=seconds===null?'용액 투입 후 시작을 누르세요.':!running?'정지 중 · 시작을 누르면 이어서 잽니다.':seconds>=MEASUREMENT_WAIT_SECONDS?target+'분 경과 · 측정점을 저장하세요.':'관찰 중 · '+target+'분을 기준으로 확인하세요.';
 document.querySelector('#startTimer').disabled=running;document.querySelector('#stopTimer').disabled=!running;
}
function exportTimerState(){return {elapsedMs:timerElapsed()===null?0:timerElapsed()*1000,running:timerIsRunning(),cycleStartedAt:timerCycleStartedAt};}
function validateTimerState(value){if(!value||!Number.isFinite(value.elapsedMs)||value.elapsedMs<0||typeof value.running!=='boolean'||value.cycleStartedAt!==null&&(!Number.isFinite(value.cycleStartedAt)||value.cycleStartedAt>Date.now())||value.cycleStartedAt===null&&(value.running||value.elapsedMs!==0))throw Error('타이머 저장 형식을 확인하세요.');return {...value};}
function restoreTimerState(value,savedAt){
 const state=validateTimerState(value);timerCycleStartedAt=state.cycleStartedAt;timerAccumulatedMs=state.elapsedMs+(state.running?Math.max(0,Date.now()-savedAt):0);timerStartedAt=state.running?performance.now():null;renderTimer();
}
document.querySelector('#startTimer').onclick=startTimer;document.querySelector('#stopTimer').onclick=stopTimer;document.querySelector('#resetTimer').onclick=resetTimer;
setInterval(renderTimer,250);renderTimer();
