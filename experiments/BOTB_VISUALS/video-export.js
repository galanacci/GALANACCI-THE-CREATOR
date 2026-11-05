const panel = document.querySelector('#export-panel');
const open = document.querySelector('#export-open');
const start = document.querySelector('#export-start');
const cancel = document.querySelector('#export-cancel');
const progress = document.querySelector('#export-progress');
const status = document.querySelector('#export-status');
const download = document.querySelector('#export-download');
const selector = document.querySelector('#visual-select');
let controller = null;
let downloadUrl = null;

// Frame timestamps, rather than screen recording, guarantee exactly five
// minutes of 1080p video even if rendering is slower than real time.
export async function encodeVisual(kind, { duration = 300, onProgress = () => {}, signal } = {}) {
  const {Output,Mp4OutputFormat,BufferTarget,CanvasSource,Quality,canEncodeVideo} = await import('./vendor/mediabunny-1.65.2.mjs');
  if (!await canEncodeVideo('avc',{width:1920,height:1080,bitrate:8000000})) {
    throw new Error('MP4 export needs a browser with H.264 video encoding. Please use current Chrome or Edge on desktop.');
  }
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
  const render=await window.botbVideo.createRenderer(kind,canvas);
  const target=new BufferTarget();
  const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  const source=new CanvasSource(canvas,{codec:'avc',quality:new Quality({bitrate:8000000}),keyFrameInterval:2});
  output.addVideoTrack(source,{frameRate:30});
  try {
    await output.start();
    const frames=Math.round(duration*30);
    for(let frame=0;frame<frames;frame++) {
      if(signal?.aborted) throw new DOMException('Export cancelled','AbortError');
      render(frame/30);
      await source.add(frame/30,1/30);
      if(frame%15===0) {
        onProgress(frame/frames);
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }
    source.close();
    await output.finalize();
    onProgress(1);
    return new Blob([target.buffer],{type:'video/mp4'});
  } catch(error) {
    await output.cancel().catch(()=>{});
    throw error;
  }
}

open.addEventListener('click',()=>{
  document.querySelector('#export-name').textContent=selector.selectedOptions[0].textContent;
  panel.showModal();
});
cancel.addEventListener('click',()=>controller ? controller.abort() : panel.close());
panel.addEventListener('cancel',event=>{if(controller){event.preventDefault();controller.abort();}});
start.addEventListener('click',async()=>{
  controller=new AbortController();
  window.botbVideo.setExporting(true);
  start.disabled=true;cancel.textContent='CANCEL EXPORT';
  progress.hidden=false;progress.value=0;download.hidden=true;
  status.textContent='Preparing 1080p MP4…';
  const kind=selector.value;
  let wakeLock;
  try {
    wakeLock=await navigator.wakeLock?.request('screen').catch(()=>null);
    const blob=await encodeVisual(kind,{signal:controller.signal,onProgress:value=>{
      progress.value=value;status.textContent=value===1?'Finalizing video…':`Rendering ${Math.floor(value*100)}%`;
    }});
    if(downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl=URL.createObjectURL(blob);
    download.href=downloadUrl;download.download=`BOTB_${kind.toUpperCase()}_1080p_16x9_5MIN.mp4`;
    download.hidden=false;
    status.textContent='Ready — 5:00 · 1920 × 1080 · 30 fps. Click Download MP4 to save.';
  } catch(error) {
    status.textContent=error.name==='AbortError'?'Export cancelled.':error.message;
  } finally {
    await wakeLock?.release().catch(()=>{});
    controller=null;window.botbVideo.setExporting(false);
    start.disabled=false;cancel.textContent='CLOSE';
  }
});
