require("dotenv").config();
const express = require("express");
const path = require("path");
const app = express();
app.disable("x-powered-by");
app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/api/health",(_req,res)=>res.json({ok:true,app:"Nova AI Cloud",provider:"Free public endpoint (best effort)",apiKeyRequired:false}));

app.post("/api/chat",async(req,res)=>{
  try{
    const incoming=Array.isArray(req.body?.messages)?req.body.messages:[];
    const messages=incoming.filter(m=>m&&["user","assistant"].includes(m.role)&&typeof m.content==="string").slice(-12);
    if(!messages.length||!messages.some(m=>m.role==="user"))return res.status(400).json({error:"Message likho pehle."});
    const conversation=messages.map(m=>(m.role==="user"?"User":"Nova")+": "+m.content.slice(0,3500)).join("\n\n");
    const prompt="You are Nova AI, a helpful assistant. Answer clearly and accurately in the user's language (Hindi, Bengali, Hinglish or English). For difficult questions, explain steps. Never claim to be ChatGPT or claim tools you do not have.\n\n"+conversation+"\n\nNova:";
    const upstream=await fetch("https://text.pollinations.ai/"+encodeURIComponent(prompt),{headers:{"Accept":"text/plain"},signal:AbortSignal.timeout(60000)});
    if(!upstream.ok)return res.status(503).json({error:"Free AI service abhi busy hai ("+upstream.status+"). Thodi der baad try karo."});
    const reply=(await upstream.text()).trim();
    if(!reply)return res.status(503).json({error:"AI ne khaali jawab diya. Dobara try karo."});
    res.json({reply:reply.slice(0,12000)});
  }catch(e){res.status(503).json({error:"Free cloud AI abhi unavailable hai. Network ya provider limit ho sakti hai; baad mein try karo."});}
});

app.post("/api/image",async(req,res)=>{
  try{
    const prompt=typeof req.body?.prompt==="string"?req.body.prompt.trim().slice(0,900):"";
    if(!prompt)return res.status(400).json({error:"Image prompt likho."});
    const url="https://image.pollinations.ai/prompt/"+encodeURIComponent(prompt+", detailed composition, cinematic lighting")+"?width=768&height=768&nologo=true";
    const r=await fetch(url,{headers:{"Accept":"image/*"},signal:AbortSignal.timeout(90000)});
    if(!r.ok)return res.status(503).json({error:"Free image service busy/unavailable hai. Dobara try karo."});
    const type=r.headers.get("content-type")||"";
    if(!type.startsWith("image/"))return res.status(502).json({error:"Image service ne image return nahi ki."});
    const b=Buffer.from(await r.arrayBuffer());
    if(!b.length||b.length>12*1024*1024)return res.status(502).json({error:"Image result invalid ya bahut badi hai."});
    res.json({image:"data:"+type.split(";")[0]+";base64,"+b.toString("base64")});
  }catch(e){res.status(503).json({error:"Free image service abhi unavailable hai."});}
});

app.get("/api/adult-image/status",(_req,res)=>res.json({configured:Boolean(process.env.GENLAXY_API_KEY&&process.env.GENLAXY_IMAGE_MODEL_ID)}));

app.post("/api/adult-image",async(req,res)=>{
  try{
    const key=process.env.GENLAXY_API_KEY;
    const modelId=process.env.GENLAXY_IMAGE_MODEL_ID;
    if(!key||!modelId)return res.status(503).json({error:"Alternate image provider setup abhi complete nahi hai. Render mein GENLAXY_API_KEY aur GENLAXY_IMAGE_MODEL_ID set karna hoga."});
    const prompt=typeof req.body?.prompt==="string"?req.body.prompt.trim().slice(0,2500):"";
    if(!prompt)return res.status(400).json({error:"Image prompt likho."});
    if(/\b(minor|underage|under[ -]?18|child|children|schoolgirl|schoolboy|loli|shota|age[ -]?play)\b/i.test(prompt))
      return res.status(400).json({error:"Adult image mode only accepts clearly adult fictional characters. Prompts involving minors or age ambiguity are not allowed."});
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),120000);
    try{
      const start=await fetch("https://genlaxy.ai/api/v1/api/catalog/generations",{
        method:"POST",
        headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json","Idempotency-Key":"nova-"+Date.now()+"-"+Math.random().toString(36).slice(2)},
        body:JSON.stringify({modelId,inputs:{prompt,size:"1:1"}}),
        signal:controller.signal
      });
      const startData=await start.json().catch(()=>({}));
      if(!start.ok)return res.status(start.status===401?401:502).json({error:startData.error?.message||startData.message||"Alternate provider request failed. Check API key, model ID and account balance."});
      let generation=startData.generation||startData;
      if(!generation.id)return res.status(502).json({error:"Provider ne generation ID return nahi kiya."});
      const end=Date.now()+105000;
      while(["queued","generating","pending","processing","running"].includes(String(generation.status||"").toLowerCase())&&Date.now()<end){
        await new Promise(r=>setTimeout(r,2500));
        const poll=await fetch("https://genlaxy.ai/api/v1/api/catalog/generations/"+encodeURIComponent(generation.id),{headers:{"Authorization":"Bearer "+key},signal:controller.signal});
        const pd=await poll.json().catch(()=>({}));
        if(!poll.ok)return res.status(502).json({error:pd.error?.message||pd.message||"Provider status check failed."});
        generation=pd.generation||pd;
      }
      const status=String(generation.status||"").toLowerCase();
      if(["queued","generating","pending","processing","running"].includes(status))return res.status(504).json({error:"Image generation abhi chal rahi hai. Dobara try karne se pehle thoda wait karo."});
      if(["failed","error","rejected","refused","cancelled","canceled"].includes(status))return res.status(422).json({error:generation.error?.message||generation.message||"Provider ne is prompt ko reject kiya ya generation fail hui."});
      const file=await fetch("https://genlaxy.ai/api/v1/api/catalog/generations/"+encodeURIComponent(generation.id)+"/content",{headers:{"Authorization":"Bearer "+key},signal:controller.signal});
      if(!file.ok)return res.status(502).json({error:"Provider se image file nahi mili."});
      const type=(file.headers.get("content-type")||"image/jpeg").split(";")[0];
      if(!type.startsWith("image/"))return res.status(502).json({error:"Provider ne valid image return nahi ki."});
      const bytes=Buffer.from(await file.arrayBuffer());
      if(!bytes.length||bytes.length>12*1024*1024)return res.status(502).json({error:"Image result invalid ya bahut badi hai."});
      res.json({image:"data:"+type+";base64,"+bytes.toString("base64")});
    }finally{clearTimeout(timer)}
  }catch(e){res.status(503).json({error:e.name==="AbortError"?"Image provider timeout ho gaya. Dobara try karo.":"Alternate image provider unavailable hai. API key, model ID aur balance check karo."})}
});

app.get("*",(_req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
const port=Number(process.env.PORT)||3000;
app.listen(port,"0.0.0.0",()=>console.log("Nova AI Cloud on "+port));
