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
app.get("*",(_req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
const port=Number(process.env.PORT)||3000;
app.listen(port,"0.0.0.0",()=>console.log("Nova AI Cloud on "+port));
