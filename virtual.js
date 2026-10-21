/* ChemCollective CSV는 실제 센서 기록과 별도로 보관합니다. */
let virtualData=null;
const virtualEl=id=>document.querySelector('#'+id);
function parseVirtualCSV(text,filename,initialVolume,conditions=''){
 if(text.length>10*1024*1024)throw Error('10 MB 이하의 CSV를 선택하세요.');
 // 원본 측정 CSV와 달리 ChemCollective에는 학생 정보나 중복 번호 열이 없습니다.
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 const endCell=()=>{row.push(cell);cell='';closed=false;};
 const endRow=()=>{endCell();if(row.some(v=>v.trim()!==''))rows.push(row);row=[];if(rows.length>5001)throw Error('5,000개 이하의 기록을 사용하세요.');};
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}if(c==='"'){if(cell||closed)throw Error('CSV 따옴표 형식을 확인하세요.');quoted=true;}else if(c===',')endCell();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();}else{if(closed)throw Error('CSV 구분 형식을 확인하세요.');cell+=c;}}
 if(quoted)throw Error('CSV의 닫는 따옴표가 없습니다.');if(cell||row.length||closed)endRow();
 if(rows.length<2)throw Error('CSV에 측정 기록이 없습니다.');
 const headers=rows.shift().map(h=>h.trim()),names=['Time (s)','Volume (L)','Temperature (K)','pH'];
 if(names.some(n=>headers.filter(h=>h===n).length!==1))throw Error('ChemCollective 원본 CSV의 Time (s), Volume (L), Temperature (K), pH 열이 필요합니다.');
 const records=rows.map((r,i)=>{const get=n=>r[headers.indexOf(n)];try{
  const time=finiteValue(get('Time (s)'),'시간'),totalMl=finiteValue(get('Volume (L)'),'전체 부피')*1000,kelvin=finiteValue(get('Temperature (K)'),'온도');
  const value=get('pH'),ph=value==='null'||value===undefined||value.trim()===''?null:finiteValue(value,'pH');
  if(kelvin<=0)throw Error('K 온도는 0보다 커야 합니다.');return {time,totalMl,temperature:kelvin-273.15,ph};
 }catch(e){throw Error((i+2)+'행: '+e.message);}});
 return validateVirtualData({filename,initialVolume,conditions,rows:records});
}
function validateVirtualData(data){
 if(data===null||data===undefined)return null;
 if(typeof data!=='object'||typeof data.filename!=='string'||data.filename.length>200||typeof data.conditions!=='string'||data.conditions.length>1000)throw Error('가상 실험 파일 정보 형식을 확인하세요.');
 const initialVolume=finiteValue(data.initialVolume,'초기 전체 부피');if(initialVolume<0)throw Error('초기 전체 부피는 0 이상이어야 합니다.');
 if(!Array.isArray(data.rows)||!data.rows.length||data.rows.length>5000)throw Error('가상 실험 기록은 1~5,000개여야 합니다.');
 let lastTime=-Infinity,lastVolume=-Infinity;
 const rows=data.rows.map(r=>{const out={time:finiteValue(r.time,'시간'),totalMl:finiteValue(r.totalMl,'전체 부피'),temperature:finiteValue(r.temperature,'온도'),ph:r.ph===null?null:finiteValue(r.ph,'pH')};
  if(out.time<0||out.totalMl<0||out.temperature<=-273.15||out.time<lastTime||out.totalMl<lastVolume-1e-7)throw Error('시간·부피가 음수이거나 기록 순서대로 감소합니다. 한 비커의 원본 CSV를 사용하세요.');lastTime=out.time;lastVolume=out.totalMl;return out;});
 const out={filename:data.filename,conditions:data.conditions,initialVolume,rows};
 if(!virtualPoints(out).length)throw Error('초기 전체 부피 이상의 용액 기록이 없습니다. 초기 부피와 파일을 확인하세요.');return out;
}
function virtualPoints(data=virtualData){return data?data.rows.filter(r=>r.totalMl>0&&r.totalMl-data.initialVolume>=-1e-7).map(r=>({...r,volume:Math.max(0,Math.round((r.totalMl-data.initialVolume)*1e8)/1e8)})):[];}
function virtualSettings(){const n=finiteValue(virtualEl('virtualInitialVolume').value,'초기 전체 부피');if(n<0)throw Error('초기 전체 부피는 0 이상이어야 합니다.');return {initialVolume:n,conditions:virtualEl('virtualConditions').value};}
function exportVirtualData(){if(!virtualData)return null;return validateVirtualData({...virtualData,...virtualSettings()});}
function restoreVirtualData(data){virtualData=data;virtualEl('virtualInitialVolume').value=data?data.initialVolume:32;virtualEl('virtualConditions').value=data?data.conditions:'';renderVirtualComparison();}
function virtualStatus(message){virtualEl('virtualImportStatus').textContent=message;}
function applyVirtualSettings(){try{const settings=virtualSettings();if(virtualData)virtualData=validateVirtualData({...virtualData,...settings});analysisDirty=true;renderVirtualComparison();refreshAnalysisCompletion();virtualStatus(virtualData?'설정을 적용했습니다. 입력한 초기 전체 부피를 기준으로 투입 부피를 계산합니다.':'설정을 확인했습니다. ChemCollective CSV를 선택하세요.');}catch(e){virtualStatus(e.message+' 이전 그래프와 데이터는 유지됩니다.');}}
virtualEl('virtualInitialVolume').onchange=applyVirtualSettings;
virtualEl('virtualConditions').oninput=()=>{if(virtualData)virtualData.conditions=virtualEl('virtualConditions').value;analysisDirty=true;refreshAnalysisCompletion();};
virtualEl('virtualCSV').onchange=async event=>{
 const file=event.target.files[0];if(!file)return;virtualEl('virtualCSV').disabled=true;
 try{if(file.size>10*1024*1024)throw Error('10 MB 이하의 파일을 선택하세요.');const settings=virtualSettings();const candidate=parseVirtualCSV(await file.text(),file.name,settings.initialVolume,settings.conditions);virtualData=candidate;analysisDirty=true;renderVirtualComparison();refreshAnalysisCompletion();virtualStatus('가상 실험 CSV를 불러왔습니다. 실제 센서 기록과 작성한 답변은 유지됩니다.');}
 catch(e){virtualStatus('불러오지 못했습니다: '+e.message+' 이전 데이터는 유지됩니다.');}finally{event.target.value='';virtualEl('virtualCSV').disabled=false;}
};
virtualEl('clearVirtualData').onclick=()=>{virtualData=null;analysisDirty=true;renderVirtualComparison();refreshAnalysisCompletion();virtualStatus('가상 실험 데이터만 비웠습니다. 실제 측정 데이터와 답변은 유지됩니다.');};
function renderVirtualComparison(){
 const vp=virtualPoints();drawComparisonChart('comparisonTemperature',analysisData.points,vp,'temperature','온도(℃)');drawComparisonChart('comparisonPH',analysisData.points,vp,'ph','pH');
 const summary=virtualEl('virtualSummary'),body=virtualEl('virtualRows');body.replaceChildren();
 if(!virtualData){summary.textContent='가상 CSV를 업로드하면 비교 그래프가 나타납니다. 실제 측정 데이터는 위의 데이터 불러오기에서 가져오세요.';return;}
 const peak=vp.reduce((a,r)=>!a||r.temperature>a.temperature?r:a,null),excluded=virtualData.rows.length-vp.length;
 summary.textContent=virtualData.filename+' · 초기 전체 부피 '+virtualData.initialVolume.toFixed(2)+' mL · 비교 기록 '+vp.length+'개 · 제외 '+excluded+'개 (빈 비커 또는 초기 부피 미만) · 가상 최고 온도 '+peak.temperature.toFixed(2)+' ℃ / 투입 '+peak.volume.toFixed(2)+' mL'+(!vp.some(r=>r.volume===0)?' · 투입 0 mL 기록 없음':'')+(!analysisData.points.length?' · 실제 측정점은 아직 없습니다.':'');
 for(const r of vp){const tr=document.createElement('tr');for(const value of [r.time.toFixed(3),r.totalMl.toFixed(2),r.volume.toFixed(2),r.temperature.toFixed(2),r.ph===null?'미측정':r.ph.toFixed(2)]){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}body.appendChild(tr);}
}
function drawComparisonChart(id,actual,virtual,yKey,yLabel){
 const target=virtualEl(id),note=virtualEl(id+'Note');target.replaceChildren();
 const bounds=chartBounds([...actual,...virtual],'volume',yKey),add=(tag,attrs,text)=>target.appendChild(svgNode(tag,attrs,text));
 if(!bounds){add('text',{x:360,y:150,'text-anchor':'middle',fill:'#526478','font-size':18},'가상 CSV 또는 실제 측정점을 불러오세요.');note.textContent='가상 0개 · 실제 0개';return;}
 const {xmin,xmax,ymin,ymax}=bounds,left=76,top=30,width=612,height=226,sx=n=>left+(n-xmin)/(xmax-xmin)*width,sy=n=>top+height-(n-ymin)/(ymax-ymin)*height;
 for(let i=0;i<=4;i++){const y=ymin+(ymax-ymin)*i/4,x=xmin+(xmax-xmin)*i/4;add('line',{x1:left,y1:sy(y),x2:left+width,y2:sy(y),stroke:'#dce6f0'});add('text',{x:left-10,y:sy(y)+5,'text-anchor':'end',fill:'#526478','font-size':15},y.toFixed(yKey==='ph'?1:2));add('line',{x1:sx(x),y1:top,x2:sx(x),y2:top+height,stroke:'#edf2f8'});add('text',{x:sx(x),y:top+height+25,'text-anchor':'middle',fill:'#526478','font-size':15},x.toFixed(1));}
 add('text',{x:left,y:20,fill:'#183047','font-size':16},yLabel);add('text',{x:left+width/2,y:310,'text-anchor':'middle',fill:'#183047','font-size':16},'누적 수산화나트륨 투입 부피(mL)');
 const series=[{name:'가상 실험',rows:virtual,color:'#386d80',dash:'7 4'},{name:'실제 실험',rows:actual,color:'#c77743',dash:''}];
 for(const s of series){let d='',previous=false;for(const r of s.rows){if(!Number.isFinite(r.volume)||!Number.isFinite(r[yKey])){previous=false;continue;}d+=(previous?'L':'M')+sx(r.volume).toFixed(2)+','+sy(r[yKey]).toFixed(2)+' ';previous=true;}add('path',{d,fill:'none',stroke:s.color,'stroke-width':2,'stroke-dasharray':s.dash});for(const r of s.rows){if(!Number.isFinite(r[yKey]))continue;const outside=s.name==='실제 실험'&&yKey==='ph'&&(r.ph<4||r.ph>10||r.outside||(r.state||'').includes('보정 범위 밖'));const dot=svgNode('circle',{cx:sx(r.volume),cy:sy(r[yKey]),r:4,fill:outside?'#a96300':s.color});dot.appendChild(svgNode('title',{},s.name+' · '+r.volume.toFixed(2)+' mL · '+yLabel+' '+r[yKey].toFixed(2)+(outside?' · 보정 범위 밖 추정값':'')));target.appendChild(dot);}}
 note.textContent='가상 실험 (파랑 점선) '+virtual.filter(r=>Number.isFinite(r[yKey])).length+'개 · 실제 실험 (주황 실선) '+actual.filter(r=>Number.isFinite(r[yKey])).length+'개';
}
function buildVirtualReport(){
 if(!virtualData)return '';virtualData=exportVirtualData();renderVirtualComparison();const vp=virtualPoints(),e=escapeReport;
 const rows=vp.map(r=>'<tr>'+[r.time.toFixed(3),r.totalMl.toFixed(2),r.volume.toFixed(2),r.temperature.toFixed(2),r.ph===null?'미측정':r.ph.toFixed(2)].map(x=>'<td>'+e(x)+'</td>').join('')+'</tr>').join('');
 const graphs=[['comparisonTemperature','가상·실제 투입 부피–온도'],['comparisonPH','가상·실제 투입 부피–pH']].map(([id,title])=>'<section class="chart"><h3>'+title+'</h3>'+virtualEl(id).outerHTML+'<p>'+e(virtualEl(id+'Note').textContent)+'</p></section>').join('');
 return '<h2>가상 실험과 실제 실험 비교</h2><p>'+e(virtualEl('virtualSummary').textContent)+'</p><p>가상 실험 조건: '+e(virtualData.conditions||'기록하지 않음')+'</p><p>투입 부피 = 전체 부피 − 초기 전체 부피. 온도는 K에서 273.15를 빼서 ℃로 변환했습니다. 가상 실험값은 설정된 조건의 결과이며 실제 실험의 정답을 뜻하지 않습니다. 농도·지시약 양·온도·기록 시점과 열 교환 조건을 함께 비교하세요.</p><div class="graphs">'+graphs+'</div><h3>변환한 가상 실험 기록</h3><div class="table-wrap"><table><thead><tr><th>원본 시간(s)</th><th>전체 부피(mL)</th><th>투입 부피(mL)</th><th>온도(℃)</th><th>pH</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
renderVirtualComparison();
