export async function managementRequest(url:string,method="GET",body?:unknown) {
  const response=await fetch(url,{method,cache:"no-store",...(body!==undefined?{headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
  const value=await response.json();
  if(!response.ok)throw Object.assign(new Error(value.error||"자료를 처리하지 못했어요."),{status:response.status});
  return value;
}
