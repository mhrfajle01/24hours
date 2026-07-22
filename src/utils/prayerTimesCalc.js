// Simple astronomical calculation for Islamic Prayer Times
// Based on standard formulas (e.g. PrayTimes.org style approximations)

export function getPrayerTimes(date, latitude, longitude, timezoneOffset) {
  // Days since 2000
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  
  // Julian Date calculation
  let julianDate = 367 * year - Math.floor((7 * (year + Math.floor((month + 9) / 12))) / 4) + Math.floor((275 * month) / 9) + day - 730531.5;
  
  // Solar parameters
  const d = julianDate; // Days since epoch
  const g = (357.529 + 0.98560028 * d) % 360;
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = (q + 1.915 * Math.sin(deg2rad(g)) + 0.020 * Math.sin(deg2rad(2 * g))) % 360;
  
  const R = 1.00014 - 0.01671 * Math.cos(deg2rad(g)) - 0.00014 * Math.cos(deg2rad(2 * g));
  const e = 23.439 - 0.00000036 * d;
  
  const RA = rad2deg(Math.atan2(Math.cos(deg2rad(e)) * Math.sin(deg2rad(L)), Math.cos(deg2rad(L)))) / 15;
  const decl = rad2deg(Math.asin(Math.sin(deg2rad(e)) * Math.sin(deg2rad(L))));
  
  const EqT = q/15 - RA; // Equation of time
  
  // Midday
  const midDay = 12 + timezoneOffset - longitude/15 - EqT;
  
  // Sunrise/Sunset hour angles
  const sunAltitude = -0.833; // Standard refraction angle
  const sunriseHourAngle = rad2deg(Math.acos((Math.sin(deg2rad(sunAltitude)) - Math.sin(deg2rad(latitude)) * Math.sin(deg2rad(decl))) / (Math.cos(deg2rad(latitude)) * Math.cos(deg2rad(decl))))) / 15;
  
  // Fajr hour angle (18 degrees angle)
  const fajrAngle = -18.0;
  const fajrHourAngle = rad2deg(Math.acos((Math.sin(deg2rad(fajrAngle)) - Math.sin(deg2rad(latitude)) * Math.sin(deg2rad(decl))) / (Math.cos(deg2rad(latitude)) * Math.cos(deg2rad(decl))))) / 15;
  
  // Isha hour angle (18 degrees angle)
  const ishaAngle = -18.0;
  const ishaHourAngle = rad2deg(Math.acos((Math.sin(deg2rad(ishaAngle)) - Math.sin(deg2rad(latitude)) * Math.sin(deg2rad(decl))) / (Math.cos(deg2rad(latitude)) * Math.cos(deg2rad(decl))))) / 15;
  
  // Asr hour angle (Shafi'i/Standard shadow multiplier = 1)
  const gAsr = Math.tan(deg2rad(Math.abs(latitude - decl)));
  const asrAltitude = rad2deg(Math.atan(1 / (1 + gAsr)));
  const asrHourAngle = rad2deg(Math.acos((Math.sin(deg2rad(asrAltitude)) - Math.sin(deg2rad(latitude)) * Math.sin(deg2rad(decl))) / (Math.cos(deg2rad(latitude)) * Math.cos(deg2rad(decl))))) / 15;
  
  // Calculate final times in hours
  const fajrTime = midDay - fajrHourAngle;
  const sunriseTime = midDay - sunriseHourAngle;
  const dhuhrTime = midDay; // noon
  const asrTime = midDay + asrHourAngle;
  const maghribTime = midDay + sunriseHourAngle;
  const ishaTime = midDay + ishaHourAngle;

  const makeDate = (hourFraction) => {
    const resDate = new Date(date);
    let hours = Math.floor(hourFraction);
    let minutes = Math.floor((hourFraction - hours) * 60);
    
    // Normalize hours
    if (hours < 0) hours += 24;
    if (hours >= 24) hours -= 24;
    
    resDate.setHours(hours, minutes, 0, 0);
    return resDate;
  };

  return {
    Fajr: makeDate(fajrTime),
    Sunrise: makeDate(sunriseTime),
    Dhuhr: makeDate(dhuhrTime),
    Asr: makeDate(asrTime),
    Maghrib: makeDate(maghribTime),
    Isha: makeDate(ishaTime)
  };
}

function deg2rad(deg) {
  return (deg * Math.PI) / 180.0;
}

function rad2deg(rad) {
  return (rad * 180.0) / Math.PI;
}
