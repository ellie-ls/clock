// The 10 horse pictures are named 0.png, 1.png, ... 9.png inside the "images" folder

// Load all 10 pictures right away so the clock doesn't flicker
for (var i = 0; i <= 9; i++) {
  var preload = new Image();
  preload.src = "images/" + i + ".png";
}

/* ---------------------------------------------------------- */
/*  FAKE TIME (for previewing)                                */
/* ---------------------------------------------------------- */

// index.html?time=2026-09-29T18:30 pretends it is 6:30 PM on Sept 29 (and the time keeps ticking)
var fakeTime = new URLSearchParams(window.location.search).get("time");
var pageOpenedAt = Date.now();

// Use getNow() everywhere instead of new Date()
function getNow() {
  if (fakeTime) {
    var start = new Date(fakeTime);
    return new Date(start.getTime() + (Date.now() - pageOpenedAt));
  }
  return new Date();
}

/* ---------------------------------------------------------- */
/*  GREETING + DATE                                           */
/* ---------------------------------------------------------- */

// hour is 0 to 23 (real time, so 3 PM is 15)
function updateGreeting(hour) {
  var greeting;

  if (hour >= 5 && hour < 11) {
    greeting = "Good Morning";      // 5:00 AM to 10:59 AM
  } else if (hour >= 11 && hour < 17) {
    greeting = "Good Afternoon";    // 11:00 AM to 4:59 PM
  } else if (hour >= 17 && hour < 20) {
    greeting = "Good Evening";      // 5:00 PM to 7:59 PM
  } else {
    greeting = "Good Night";        // 8:00 PM to 4:59 AM
  }

  document.getElementById("greeting").textContent = greeting;
}

// Writes the date like "Tuesday September 29, 2026"
function updateDate() {
  var now = getNow();
  var weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  var rest = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  document.getElementById("date").textContent = weekday + " " + rest;
}

/* ---------------------------------------------------------- */
/*  THE CLOCK                                                 */
/* ---------------------------------------------------------- */

function updateClock() {
  var now = getNow();

  var hours = now.getHours();      // 0 to 23
  var minutes = now.getMinutes();  // 0 to 59
  var seconds = now.getSeconds();  // 0 to 59

  // Update the greeting and date (uses the real 0 to 23 hour)
  updateGreeting(hours);
  updateDate();

  // Switch to a 12 hour clock (delete these 4 lines if you want a 24 hour clock)
  if (hours > 12) {
    hours = hours - 12;
  }
  if (hours === 0) {
    hours = 12;
  }

  // Turn numbers into text, and add a 0 in front if it's only one digit (9 becomes "09")
  hours = String(hours);
  minutes = String(minutes);
  seconds = String(seconds);

  if (hours.length === 1) {
    hours = "0" + hours;
  }
  if (minutes.length === 1) {
    minutes = "0" + minutes;
  }
  if (seconds.length === 1) {
    seconds = "0" + seconds;
  }

  // Set each picture. charAt(0) is the first digit, charAt(1) is the second digit
  document.getElementById("h1").src = "images/" + hours.charAt(0) + ".png";
  document.getElementById("h2").src = "images/" + hours.charAt(1) + ".png";

  document.getElementById("m1").src = "images/" + minutes.charAt(0) + ".png";
  document.getElementById("m2").src = "images/" + minutes.charAt(1) + ".png";

  document.getElementById("s1").src = "images/" + seconds.charAt(0) + ".png";
  document.getElementById("s2").src = "images/" + seconds.charAt(1) + ".png";
}

/* ---------------------------------------------------------- */
/*  TODAY (calendar)                                          */
/* ---------------------------------------------------------- */

// The calendar files to read. To add another calendar, put its file in the folder and add its name here.
var calendarFiles = ["calendar.ics", "classes.ics"];

var allEvents = [];        // every event from all the calendar files
var calendarProblems = []; // messages about files that could not be read
var firstTimeShowing = true;

// "6:30 PM"
function formatTime(date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Text about any calendar file that could not be read (empty when everything is fine)
function problemText() {
  if (calendarProblems.length === 0) { return ""; }
  return " Problem: " + calendarProblems.join(". ");
}

// Shows the arrow at the bottom only when there are more events below
function updateMoreButton() {
  var scroller = document.getElementById("today-scroll");
  var more = document.getElementById("more");
  if (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 4) {
    more.style.visibility = "visible";
  } else {
    more.style.visibility = "hidden";
  }
}

// Draws the vertical line and the dashed "now" line.
// rows = a list of { ev: the event, row: its row on the page, dot: its circle }
// Returns how far down the dashed line is (in pixels), or null if there isn't one.
// It also remembers how far from the left the circles are (in timelineX).
var timelineX = 0;

function drawTimeline(rows, now, box) {
  var fontSize = parseFloat(window.getComputedStyle(box).fontSize);
  if (isNaN(fontSize)) { fontSize = 12; }
  var halfGap = fontSize * 0.4;   // half of the space between two boxes

  // Find the exact middle of the first and last circle (measured on the page,
  // so the lines always line up with the circles)
  var boxRect = box.getBoundingClientRect();
  var firstRect = rows[0].dot.getBoundingClientRect();
  var lastRect = rows[rows.length - 1].dot.getBoundingClientRect();
  var centerX = firstRect.left + firstRect.width / 2 - boxRect.left;
  var firstY = firstRect.top + firstRect.height / 2 - boxRect.top;
  var lastY = lastRect.top + lastRect.height / 2 - boxRect.top;
  timelineX = centerX;

  // the vertical line goes from the first circle to the last circle (nothing after the last one)
  if (rows.length > 1) {
    var line = document.createElement("div");
    line.className = "timeline-line";
    line.style.left = (centerX - 1) + "px";   // the line is 2px wide, so back up 1px to center it
    line.style.top = firstY + "px";
    line.style.height = (lastY - firstY) + "px";
    box.appendChild(line);
  }

  // the dashed line only looks at events with a time (not all-day ones)
  var timed = [];
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].ev.allDay) {
      timed.push(rows[i]);
    }
  }
  if (timed.length === 0) { return null; }

  var y = null;

  // 1. Is an event happening right now? Then the line goes through its box,
  //    as far down as we are through the event (halfway through = halfway down)
  for (var j = 0; j < timed.length; j++) {
    var ev = timed[j].ev;
    var row = timed[j].row;
    if (now >= ev.start && now < ev.end) {
      var fraction = (now - ev.start) / (ev.end - ev.start);
      y = row.offsetTop + row.offsetHeight * fraction;
      break;
    }
  }

  // 2. No event right now, so the line sits in the space between two events
  if (y === null) {
    var nextIndex = -1;
    for (var k = 0; k < timed.length; k++) {
      if (timed[k].ev.start > now) {
        nextIndex = k;
        break;
      }
    }

    if (nextIndex === -1) {
      // everything is over: line goes under the last box
      var lastRow = timed[timed.length - 1].row;
      y = lastRow.offsetTop + lastRow.offsetHeight + halfGap;
    } else if (nextIndex === 0) {
      // nothing has started yet: line goes above the first box
      y = timed[0].row.offsetTop - halfGap;
    } else {
      // between two events: how far through the break are we?
      var before = timed[nextIndex - 1];
      var after = timed[nextIndex];
      var gapFraction = (now - before.ev.end) / (after.ev.start - before.ev.end);
      var beforeBottom = before.row.offsetTop + before.row.offsetHeight;
      y = beforeBottom + (after.row.offsetTop - beforeBottom) * gapFraction;
    }
  }

  // the dashed line starts exactly in the middle of the vertical line and goes right
  var nowLine = document.createElement("div");
  nowLine.className = "now-line";
  nowLine.style.left = centerX + "px";
  nowLine.style.top = y + "px";
  box.appendChild(nowLine);
  return y;
}

// Draws today's events in the middle column
function showToday() {
  var scroller = document.getElementById("today-scroll");
  var box = document.getElementById("events");
  var now = getNow();
  var events = getEventsForDay(allEvents, now);
  var oldScroll = scroller.scrollTop;   // remember where we were scrolled to

  box.innerHTML = "";

  if (events.length === 0) {
    showCalendarMessage("Nothing on the calendar today. (" + allEvents.length + " events read)" + problemText());
    updateMoreButton();
    return;
  }

  var rows = [];

  for (var i = 0; i < events.length; i++) {
    var ev = events[i];

    // done, happening now, or coming up?
    var state;
    if (ev.allDay) {
      state = "current";
    } else if (ev.end <= now) {
      state = "past";
    } else if (ev.start <= now) {
      state = "current";
    } else {
      state = "upcoming";
    }

    // the small text under the title: the place (skip links like Google Meet), or the time span
    var info = "";
    if (ev.location && ev.location.indexOf("http") !== 0) {
      info = ev.location;
    } else if (!ev.allDay) {
      info = formatTime(ev.start) + " - " + formatTime(ev.end);
    }

    var row = document.createElement("div");
    row.className = "event " + state;

    var time = document.createElement("div");
    time.className = "event-time";
    time.textContent = ev.allDay ? "All day" : formatTime(ev.start);

    var dot = document.createElement("div");
    dot.className = "event-dot";

    var card = document.createElement("div");
    card.className = "event-card";

    var title = document.createElement("div");
    title.className = "event-title";
    title.textContent = ev.title;
    card.appendChild(title);

    if (info !== "") {
      var details = document.createElement("div");
      details.className = "event-info";
      details.textContent = info;
      card.appendChild(details);
    }

    row.appendChild(time);
    row.appendChild(dot);
    row.appendChild(card);
    box.appendChild(row);
    rows.push({ ev: ev, row: row, dot: dot });
  }

  var nowY = drawTimeline(rows, now, box);

  // put the caret right under the circles
  var more = document.getElementById("more");
  more.style.marginLeft = (timelineX - more.offsetWidth / 2) + "px";

  // if a calendar file could not be read, say so at the bottom of the list
  if (calendarProblems.length > 0) {
    var note = document.createElement("div");
    note.className = "empty";
    note.textContent = "Problem: " + calendarProblems.join(". ");
    box.appendChild(note);
  }

  // first time: scroll so the dashed line is near the top. After that: stay where you were.
  if (firstTimeShowing) {
    if (nowY !== null) {
      scroller.scrollTop = Math.max(0, nowY - 60);
    }
    firstTimeShowing = false;
  } else {
    scroller.scrollTop = oldScroll;
  }
  updateMoreButton();
}

// Shows a message in the Today box
function showCalendarMessage(message) {
  document.getElementById("events").innerHTML = '<div class="empty">' + message + '</div>';
}

// Reads one calendar file and gives back its list of events
function loadOneCalendar(fileName) {
  return fetch(fileName)
    .then(function (response) {
      if (!response.ok) {
        throw new Error(fileName + " was not found in the folder next to index.html");
      }
      return response.text();
    })
    .then(function (text) {
      var events = parseCalendar(text);
      console.log("Read " + events.length + " events from " + fileName);
      return events;
    })
    .catch(function (error) {
      console.log(error);
      calendarProblems.push(error.message);
      return [];   // skip this file, keep going with the others
    });
}

// Loads every file in calendarFiles and puts all the events together
function loadCalendar() {
  // opening index.html by double-clicking it (file://) blocks reading the calendar files
  if (window.location.protocol === "file:") {
    showCalendarMessage("Open this page with Live Server (right-click index.html in VS Code). Double-clicking it can't read the calendar files.");
    return;
  }

  // calendar.js has the reading code. If it is missing from the folder, say so.
  if (typeof parseCalendar === "undefined") {
    showCalendarMessage("calendar.js is missing. Put it in the same folder as index.html.");
    return;
  }

  var requests = [];
  for (var i = 0; i < calendarFiles.length; i++) {
    requests.push(loadOneCalendar(calendarFiles[i]));
  }

  Promise.all(requests).then(function (lists) {
    allEvents = [];
    for (var j = 0; j < lists.length; j++) {
      allEvents = allEvents.concat(lists[j]);
    }
    showToday();
  });
}

/* ---------------------------------------------------------- */
/*  TO-DO LIST                                                */
/* ---------------------------------------------------------- */

var todos = [];   // each item looks like { text: "Groceries", done: false }

// Get the saved list from the browser (or start with these 3)
function loadTodos() {
  var saved = null;
  try {
    saved = localStorage.getItem("horseClockTodos");
  } catch (error) {}

  if (saved) {
    todos = JSON.parse(saved);
  } else {
    todos = [
      { text: "Prep for meeting", done: false },
      { text: "Groceries", done: false },
      { text: "Write cards", done: false }
    ];
  }
}

// Save the list in the browser so it is still there next time
function saveTodos() {
  try {
    localStorage.setItem("horseClockTodos", JSON.stringify(todos));
  } catch (error) {}
}

// Builds one row (checkbox + text + x) for the item at position "index"
function makeTodoRow(index) {
  var row = document.createElement("div");
  row.className = "todo-item" + (todos[index].done ? " done" : "");

  var box = document.createElement("input");
  box.type = "checkbox";
  box.checked = todos[index].done;
  box.setAttribute("aria-label", "Done");
  box.onchange = function () {
    todos[index].done = box.checked;
    saveTodos();
    showTodos();
  };

  var text = document.createElement("input");
  text.type = "text";
  text.className = "todo-text";
  text.value = todos[index].text;
  text.placeholder = "New to-do";
  text.oninput = function () {
    todos[index].text = text.value;
    saveTodos();
  };
  // pressing Enter adds a new item
  text.onkeydown = function (event) {
    if (event.key === "Enter") {
      addTodo();
    }
  };

  var del = document.createElement("button");
  del.className = "todo-delete";
  del.textContent = "×";
  del.setAttribute("aria-label", "Delete");
  del.onclick = function () {
    todos.splice(index, 1);
    saveTodos();
    showTodos();
  };

  row.appendChild(box);
  row.appendChild(text);
  row.appendChild(del);
  return row;
}

// Draws the whole list
function showTodos() {
  var list = document.getElementById("todo-list");
  list.innerHTML = "";
  for (var i = 0; i < todos.length; i++) {
    list.appendChild(makeTodoRow(i));
  }
}

// Adds an empty item at the bottom and puts the cursor in it
function addTodo() {
  todos.push({ text: "", done: false });
  saveTodos();
  showTodos();

  var boxes = document.querySelectorAll(".todo-text");
  boxes[boxes.length - 1].focus();
}

document.getElementById("add-todo").onclick = addTodo;

/* ---------------------------------------------------------- */
/*  START EVERYTHING                                          */
/* ---------------------------------------------------------- */

updateClock();
setInterval(updateClock, 1000);      // every 1 second

loadCalendar();
setInterval(showToday, 60000);       // refresh the calendar list every minute

// the arrow at the bottom of Today
document.getElementById("today-scroll").onscroll = updateMoreButton;
document.getElementById("more").onclick = function () {
  var scroller = document.getElementById("today-scroll");
  scroller.scrollBy({ top: scroller.clientHeight * 0.8, behavior: "smooth" });
};

loadTodos();
showTodos();
