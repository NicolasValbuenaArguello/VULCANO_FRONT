const fs=require('fs');
(async()=>{
 const port=process.argv[2],output=process.argv[3];
 let targets=[];
 for(let i=0;i<100;i++){try{targets=await (await fetch('http://127.0.0.1:'+port+'/json')).json();if(targets.find(t=>t.type==='page'))break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const target=targets.find(t=>t.type==='page');const ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
 const cmd=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
 let value;
 for(let i=0;i<200;i++){
  const result=await cmd('Runtime.evaluate',{expression:"document.querySelector('#browser-result')?.textContent",returnByValue:true});
  value=result.result?.result?.value;if(value)break;await new Promise(r=>setTimeout(r,100));
 }
 if(!value){const result=await cmd('Runtime.evaluate',{expression:'document.body.outerHTML',returnByValue:true});fs.writeFileSync(output+'.html',result.result?.result?.value||'');throw Error('No finalizo la prueba Angular');}
 const capture=await cmd('Page.captureScreenshot',{format:'png'});fs.writeFileSync(output,Buffer.from(capture.result.data,'base64'));
 console.log(value);ws.send(JSON.stringify({id:++id,method:'Browser.close'}));ws.close();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
