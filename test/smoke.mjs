import fs from "node:fs";
const B="http://localhost:3111",log=()=>fs.readFileSync("srv.log","utf8");
const call=async(m,p,b,t)=>{const r=await fetch(B+p,{method:m,headers:{"Content-Type":"application/json",...(t?{Authorization:"Bearer "+t}:{})},body:b?JSON.stringify(b):undefined});return[r.status,await r.json().catch(()=>null)]};
async function login(phone,name){await call("POST","/auth/request",{phone});phone=phone.replace(/ /g,"");const c=[...log().matchAll(new RegExp("vers "+phone.replace("+","\\+")+"\\] Mama Care: votre code est (\\d{6})","g"))].pop()[1];
 const [s,j]=await call("POST","/auth/verify",{phone,code:c,name});return[s,j]}
const [s1,m]=await login("+229 97 00 00 01","Awa");console.log("login maman",s1,m.user.role);
const [s2,a]=await login("+22997000002","Dr Koffi");console.log("login admin",s2,a.user.role);
console.log("mauvais code",(await call("POST","/auth/verify",{phone:"+22997000001",code:"000000"}))[0]);
const lmp=new Date(Date.now()-90*864e5).toISOString().slice(0,10);
console.log("PUT state",(await call("PUT","/state",{s:{p:{name:"Awa",lmp}}},m.token))[0],"GET",(await call("GET","/state",null,m.token))[1].s.p.name);
console.log("maman -> msg",(await call("POST","/threads/me/messages",{text:"Bonjour, j’ai des nausées."},m.token))[0]);
const [,th]=await call("GET","/threads",null,a.token);console.log("inbox pro",th.length,th[0].name);
console.log("maman voit inbox",(await call("GET","/threads",null,m.token))[0]);
console.log("pro répond",(await call("POST","/threads/"+th[0].id+"/messages",{text:"Mangez peu et souvent."},a.token))[0]);
const [,msgs]=await call("GET","/threads/me/messages",null,m.token);console.log("fil maman",msgs.messages.map(x=>x.fromRole).join(","));
const [,c2]=await login("+22997000003","Bintou");console.log("autre maman lit fil d’Awa",(await call("GET","/threads/"+th[0].id+"/messages",null,c2.token))[0]);
console.log("promotion pro",(await call("PATCH","/admin/users/"+c2.user.id+"/role",{role:"pro"},a.token))[1].ok,"| maman ne peut pas promouvoir",(await call("PATCH","/admin/users/"+m.user.id+"/role",{role:"pro"},m.token))[0]);
console.log("sans token",(await call("GET","/me"))[0],"| numéro invalide",(await call("POST","/auth/request",{phone:"abc"}))[0]);
