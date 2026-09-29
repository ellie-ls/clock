// calendar.js - reads a calendar file (.ics) and finds the events for one day

// Makes a text label for a day, like "2026-9-29". Used to compare days.
function dayKey(date) {
  return date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
}

// Turns "20260929T033000Z" (or just "20260929") into a real date
function parseIcsDate(text) {
  var year = Number(text.substring(0, 4));
  var month = Number(text.substring(4, 6)) - 1;
  var day = Number(text.substring(6, 8));

  // only a date, no time = an all-day event
  if (text.length === 8) {
    return { date: new Date(year, month, day), allDay: true };
  }

  var hour = Number(text.substring(9, 11));
  var minute = Number(text.substring(11, 13));
  var second = Number(text.substring(13, 15));

  // a "Z" at the end means the time is in UTC, so let the browser convert it to your time
  if (text.charAt(text.length - 1) === "Z") {
    return { date: new Date(Date.UTC(year, month, day, hour, minute, second)), allDay: false };
  }
  return { date: new Date(year, month, day, hour, minute, second), allDay: false };
}

// Calendar files write commas as "\," and new lines as "\n". This undoes that.
function cleanText(text) {
  return text.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";");
}

// Reads the whole .ics text and returns a list of events
function parseCalendar(text) {
  // long lines get split, with the next line starting with a space. Glue them back together.
  text = text.replace(/\r\n/g, "\n").replace(/\n /g, "");
  var lines = text.split("\n");

  var events = [];
  var ev = null;        // the event we are reading right now
  var inAlarm = false;  // alarms live inside events and have their own SUMMARY, so skip them

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];

    if (line === "BEGIN:VEVENT") { ev = { exdates: [] }; continue; }
    if (line === "BEGIN:VALARM") { inAlarm = true; continue; }
    if (line === "END:VALARM") { inAlarm = false; continue; }

    if (line === "END:VEVENT") {
      if (ev && ev.start) {
        if (!ev.end) { ev.end = ev.start; }
        events.push(ev);
      }
      ev = null;
      continue;
    }

    if (ev === null || inAlarm) { continue; }

    // a line looks like  NAME;extra=stuff:value
    var colon = line.indexOf(":");
    if (colon === -1) { continue; }
    var name = line.substring(0, colon).split(";")[0];
    var value = line.substring(colon + 1);

    if (name === "SUMMARY") { ev.title = cleanText(value); }
    if (name === "LOCATION") { ev.location = cleanText(value); }
    if (name === "UID") { ev.uid = value; }
    if (name === "RRULE") { ev.rrule = value; }
    if (name === "STATUS" && value === "CANCELLED") { ev.cancelled = true; }
    if (name === "DTEND") { ev.end = parseIcsDate(value).date; }
    if (name === "DTSTART") {
      var s = parseIcsDate(value);
      ev.start = s.date;
      ev.allDay = s.allDay;
    }
    // days a repeating event is skipped
    if (name === "EXDATE") {
      var skipped = value.split(",");
      for (var k = 0; k < skipped.length; k++) {
        ev.exdates.push(dayKey(parseIcsDate(skipped[k]).date));
      }
    }
    // this event is a changed copy of one day of a repeating event
    if (name === "RECURRENCE-ID") { ev.recurrenceId = dayKey(parseIcsDate(value).date); }
  }
  return events;
}

// Does a repeating event happen on this day? (start = the time it would start that day)
function repeatsOnDay(ev, dayStart, occurrenceStart) {
  var firstDay = new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate());
  if (dayStart < firstDay) { return false; }

  // turn "FREQ=WEEKLY;BYDAY=MO" into rule.FREQ and rule.BYDAY
  var rule = {};
  var parts = ev.rrule.split(";");
  for (var i = 0; i < parts.length; i++) {
    var pair = parts[i].split("=");
    rule[pair[0]] = pair[1];
  }

  // stop after the UNTIL date
  if (rule.UNTIL && occurrenceStart > parseIcsDate(rule.UNTIL).date) { return false; }

  var interval = Number(rule.INTERVAL || 1);
  var daysBetween = Math.round((dayStart - firstDay) / 86400000);

  if (rule.FREQ === "DAILY") {
    return daysBetween % interval === 0;
  }
  if (rule.FREQ === "WEEKLY") {
    var names = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    var days = rule.BYDAY ? rule.BYDAY.split(",") : [names[ev.start.getDay()]];
    return days.indexOf(names[dayStart.getDay()]) !== -1 && Math.floor(daysBetween / 7) % interval === 0;
  }
  if (rule.FREQ === "MONTHLY") {
    var dayOfMonth = rule.BYMONTHDAY ? Number(rule.BYMONTHDAY) : ev.start.getDate();
    return dayStart.getDate() === dayOfMonth;
  }
  if (rule.FREQ === "YEARLY") {
    return dayStart.getMonth() === ev.start.getMonth() && dayStart.getDate() === ev.start.getDate();
  }
  return false;
}

// Returns the events that happen on one day, in time order
function getEventsForDay(events, day) {
  var dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  var dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  var key = dayKey(dayStart);

  // remember which days of repeating events were changed (so we don't show them twice)
  var changed = {};
  for (var i = 0; i < events.length; i++) {
    if (events[i].recurrenceId) {
      changed[events[i].uid + "|" + events[i].recurrenceId] = true;
    }
  }

  var found = [];
  for (var j = 0; j < events.length; j++) {
    var ev = events[j];
    if (ev.cancelled) { continue; }

    var start = null;
    var end = null;

    if (!ev.rrule) {
      // a normal, one-time event
      if (ev.start < dayEnd && ev.end > dayStart) {
        start = ev.start;
        end = ev.end;
      }
    } else {
      // a repeating event: same time of day, on the days the rule says
      var todayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(),
        ev.start.getHours(), ev.start.getMinutes(), ev.start.getSeconds());

      if (repeatsOnDay(ev, dayStart, todayStart)
          && ev.exdates.indexOf(key) === -1
          && !changed[ev.uid + "|" + key]) {
        start = todayStart;
        end = new Date(todayStart.getTime() + (ev.end - ev.start));
      }
    }

    if (start) {
      found.push({
        title: ev.title || "(No title)",
        location: ev.location || "",
        start: start,
        end: end,
        allDay: ev.allDay
      });
    }
  }

  found.sort(function (a, b) { return a.start - b.start; });
  return found;
}
