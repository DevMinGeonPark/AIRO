"use client";
import type { ReactNode } from "react";
import { bookingAndroidIntent } from "@/lib/booking-app-link";

export function BookingPlatformLink({href,className,children}:{href:string;className?:string;children:ReactNode}) {
  return <a href={href} className={className} target="_blank" rel="noopener noreferrer" onClick={event=>{
    if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!/Android/i.test(navigator.userAgent))return;
    const intent=bookingAndroidIntent(href);if(intent){event.preventDefault();window.location.assign(intent);}
  }}>{children}</a>;
}
