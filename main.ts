import{readdirSync,readFileSync,writeFileSync,mkdirSync}from'node:fs';
const T=c=>{throw c};
function R(d){
let p=readFileSync(I+'/'+d+'/program.bin'),q=readFileSync(I+'/'+d+'/input.bin'),s=new Int32Array(256),m=new Int32Array(256),c=[],o=[],sp=0,ip=0,pc=0,t=0,x=0,a,b;
const N=n=>sp<n&&T(2),P=v=>{sp>255&&T(3);s[sp++]=v};
try{for(;;){
t>=1e6&&T(10);
(pc>>>0)>=p.length&&T(9);
let k=p[pc],L=k==2?4:k==1?1:k>47&&k<52?2:0;
pc+L>=p.length&&T(9);
t++;
if(k==0)T(0);
else if(k==1)P(p[pc+1]<<24>>24);
else if(k==2)P(p[pc+1]|p[pc+2]<<8|p[pc+3]<<16|p[pc+4]<<24);
else if(k==3)N(1),sp--;
else if(k==4)N(1),P(s[sp-1]);
else if(k==5)N(2),a=s[sp-1],s[sp-1]=s[sp-2],s[sp-2]=a;
else if(k==6)N(2),P(s[sp-2]);
else if(k==7)N(3),a=s[sp-3],s[sp-3]=s[sp-2],s[sp-2]=s[sp-1],s[sp-1]=a;
else if(k>15&&k<35&&k!=31){
if(k==23||k==27)N(1),s[sp-1]=k<24?-s[sp-1]:~s[sp-1];
else N(2),b=s[--sp],a=s[sp-1],s[sp-1]=k==16?a+b:k==17?a-b:k==18?Math.imul(a,b):k==19?b?(a/b)|0:T(4):k==20?b?a%b:T(4):k==21?b?((a>>>0)/(b>>>0))|0:T(4):k==22?b?((a>>>0)%(b>>>0))|0:T(4):k==24?a&b:k==25?a|b:k==26?a^b:k==28?a<<(b&31):k==29?a>>(b&31):k==30?a>>>(b&31):k==32?a==b?1:0:k==33?a<b?1:0:(a>>>0)<(b>>>0)?1:0;
}
else if(k>47&&k<52){
let j=(p[pc+1]|p[pc+2]<<8)<<16>>16;
if(k==48){pc+=3+j;continue}
if(k==49){N(1);a=s[--sp];pc+=3+(a?0:j);continue}
if(k==50){N(1);a=s[--sp];pc+=3+(a?j:0);continue}
c.length>63&&T(7);c.push(pc+3);pc=p[pc+1]|p[pc+2]<<8;continue;
}
else if(k==52){!c.length&&T(8);pc=c.pop();continue}
else if(k==64)N(1),a=s[sp-1],(a>>>0)>255&&T(6),s[sp-1]=m[a];
else if(k==65)N(2),a=s[--sp],b=s[--sp],(a>>>0)>255&&T(6),m[a]=b;
else if(k==80){N(1);a=s[--sp];let g=''+a;o.length+g.length>65536&&T(11);o.push(...Buffer.from(g))}
else if(k==81)N(1),o.length>65535&&T(11),o.push(s[--sp]&255);
else if(k==82)P(ip<q.length?q[ip++]:-1);
else if(k==83)N(1),T(s[--sp]&255);
else T(5);
pc+=1+L;
}}catch(e){x=e}
writeFileSync(O+'/'+d+'/stdout.bin',Buffer.from(o));
writeFileSync(O+'/'+d+'/exit.txt',x+'\n');
}
const I=process.env.MAKEFUN_INPUT_DIR||'/input',O=process.env.MAKEFUN_OUTPUT_DIR||'/output';
for(const d of readdirSync(I).sort()){mkdirSync(O+'/'+d,{recursive:true});R(d)}
