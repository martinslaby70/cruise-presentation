'use strict';

/* ========================================
   Cruise Presentation — Engine
   ======================================== */

// --- State ---
const state = {
  currentSlide: 0,
  totalSlides: 8,
  isAnimating: false,
};

// --- DOM References ---
const slideTrack = document.getElementById('slideTrack');
const progressBar = document.getElementById('progressBar');
const currentSlideNum = document.getElementById('currentSlideNum');
const navHint = document.getElementById('navHint');

// --- Per-Slide Timeline Registry (for future spacebar animations) ---
const slideTimelines = new Map();

// --- Per-Slide Leave Animation Registry ---
const slideLeaveAnimations = new Map();

// --- Per-Slide Enter Animation Registry ---
// Maps slideIndex -> function() that animates content in (replaces default fade).
const slideEnterAnimations = new Map();

// --- Custom Transition Durations ---
// Maps "from-to" -> duration. Use 0 for instant horizontal jump (e.g. vertical transitions).
const slideTransitionDurations = new Map();

// --- Per-Slide Reset Functions ---
const slideResetFunctions = new Map();

/**
 * Register a GSAP timeline for a specific slide.
 * The buildFn receives the slide element and must return a paused gsap.timeline with labels.
 * Each spacebar press advances to the next label.
 */
function registerSlideTimeline(slideIndex, buildFn) {
  const slideEl = document.querySelector('[data-slide="' + slideIndex + '"]');
  if (!slideEl) return;

  const tl = buildFn(slideEl);
  tl.pause();

  slideTimelines.set(slideIndex, {
    timeline: tl,
    stepIndex: 0,
    labels: Object.keys(tl.labels),
  });
}

/**
 * Advance the current slide's timeline by one label step.
 * Plays from the current label to the next label (not to the end).
 */
function advanceSlideTimeline() {
  var entry = slideTimelines.get(state.currentSlide);

  // No timeline registered or no steps left — go to next slide
  if (!entry) { goNext(); return; }

  // Custom handler (e.g. ports slide with dynamic positioning)
  if (entry.custom) {
    entry.custom();
    return;
  }

  if (entry.stepIndex >= entry.labels.length) { goNext(); return; }

  var currentLabel = entry.labels[entry.stepIndex];
  var nextLabel = entry.labels[entry.stepIndex + 1] || null;

  if (nextLabel) {
    entry.timeline.tweenFromTo(currentLabel, nextLabel);
  } else {
    // Last step — play from label to end
    entry.timeline.play(currentLabel);
  }

  entry.stepIndex++;
}

// --- Navigation ---

function navigate(targetIndex) {
  if (targetIndex < 0 || targetIndex >= state.totalSlides) return;
  if (targetIndex === state.currentSlide) return;
  if (state.isAnimating) return;

  state.isAnimating = true;
  var previousSlide = state.currentSlide;
  var direction = targetIndex > state.currentSlide ? 1 : -1;
  state.currentSlide = targetIndex;

  // Check for a custom leave animation on the current slide
  var leaveFn = slideLeaveAnimations.get(previousSlide);

  if (leaveFn) {
    var leaveTl = leaveFn(direction);
    leaveTl.eventCallback('onComplete', function () {
      performTransition(targetIndex, previousSlide);
    });
  } else {
    onSlideLeave(previousSlide);
    performTransition(targetIndex, previousSlide);
  }
}

function performTransition(targetIndex, fromIndex) {
  var key = fromIndex + '-' + targetIndex;
  var duration = slideTransitionDurations.has(key) ? slideTransitionDurations.get(key) : 0.8;

  gsap.to(slideTrack, {
    x: -targetIndex * window.innerWidth,
    duration: duration,
    ease: duration > 0 ? 'power2.inOut' : 'none',
    onComplete: function () {
      state.isAnimating = false;
      onSlideEnter(targetIndex);
      updateUI();
    },
  });

  // Update progress bar immediately for responsiveness
  gsap.to(progressBar, {
    width: ((targetIndex + 1) / state.totalSlides) * 100 + '%',
    duration: 0.4,
    ease: 'power1.out',
  });
}

function goNext() {
  navigate(state.currentSlide + 1);
}

function goPrev() {
  navigate(state.currentSlide - 1);
}

// --- Slide Enter/Leave Hooks ---

function onSlideEnter(index) {
  var slideEl = document.querySelector('[data-slide="' + index + '"]');
  if (!slideEl) return;

  // Reset slide timeline and element states when re-entering
  var entry = slideTimelines.get(index);
  if (entry) {
    entry.timeline.progress(0).pause();
    entry.stepIndex = 0;
  }
  var resetFn = slideResetFunctions.get(index);
  if (resetFn) resetFn();

  // Custom enter animation or default fade
  var enterFn = slideEnterAnimations.get(index);
  if (enterFn) {
    enterFn();
  } else {
    var content = slideEl.querySelector('.slide__content');
    if (content) {
      gsap.fromTo(
        content,
        {opacity: 0.7, scale: 0.97},
        {opacity: 1, scale: 1, duration: 0.5, ease: 'power1.out', delay: 0.15}
      );
    }
  }
}

function onSlideLeave(index) {
  var slideEl = document.querySelector('[data-slide="' + index + '"]');
  if (!slideEl) return;

  var content = slideEl.querySelector('.slide__content');

  gsap.to(content, {
    opacity: 0.7,
    scale: 0.97,
    duration: 0.3,
    ease: 'power1.in',
  });
}

// --- UI Updates ---

function updateUI() {
  currentSlideNum.textContent = state.currentSlide + 1;
}

// --- Keyboard Controller ---

document.addEventListener('keydown', function (event) {
  switch (event.key) {
    case 'ArrowRight':
      event.preventDefault();
      goNext();
      fadeNavHint();
      break;
    case 'ArrowLeft':
      event.preventDefault();
      goPrev();
      fadeNavHint();
      break;
    case ' ':
      event.preventDefault();
      advanceSlideTimeline();
      break;
  }
});

// Fade out the nav hint after first interaction
var navHintFaded = false;
function fadeNavHint() {
  if (navHintFaded) return;
  navHintFaded = true;
  gsap.to(navHint, {opacity: 0, duration: 1, delay: 0.5});
}

// --- Resize Handler ---

window.addEventListener('resize', function () {
  gsap.set(slideTrack, {x: -state.currentSlide * window.innerWidth});
});

// --- Title Slide Setup ---

function setupTitleSlide() {
  var titleSlide = document.querySelector('[data-slide="0"]');
  if (!titleSlide) return;

  var ornament = titleSlide.querySelector('.slide__ornament');
  var heading = titleSlide.querySelector('.slide__heading');
  var divider = titleSlide.querySelector('.slide__divider');
  var subtitle = titleSlide.querySelector('.slide__subtitle');

  // Hide spacebar-triggered elements initially
  gsap.set([ornament, divider, subtitle], {autoAlpha: 0});

  // Heading animates in on page load
  gsap.from(heading, {
    opacity: 0,
    y: 40,
    duration: 0.8,
    ease: 'power2.out',
    delay: 0.3,
  });

  // Nav hint fades in after heading
  gsap.from(navHint, {
    opacity: 0,
    duration: 0.5,
    delay: 0.8,
  });

  // Register spacebar timeline: 1 step (anchor first, then line + subtitle together)
  registerSlideTimeline(0, function () {
    var tl = gsap.timeline({paused: true});

    tl.addLabel('step1')
      .to(ornament, {
        autoAlpha: 1,
        scale: 1,
        rotation: 0,
        duration: 0.8,
        ease: 'back.out(1.7)',
      })
      .to(
        divider,
        {
          autoAlpha: 1,
          scaleX: 1,
          duration: 0.5,
          ease: 'power2.inOut',
        },
        '-=0.2'
      )
      .to(
        subtitle,
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.6,
          ease: 'power2.out',
        },
        '<'
      )
      // Water reveal — lower text opacity so GIF shows through with white overlay
      .to(
        heading,
        {
          color: 'rgba(250, 250, 247, 0.5)',
          duration: 1.2,
          ease: 'power1.inOut',
        },
        '-=0.3'
      );

    // Set pre-animation states
    gsap.set(ornament, {scale: 0, rotation: -180});
    gsap.set(divider, {scaleX: 0});
    gsap.set(subtitle, {y: 20});

    return tl;
  });

  // Reset: restore initial hidden states
  slideResetFunctions.set(0, function () {
    gsap.set([ornament, divider, subtitle], {autoAlpha: 0});
    gsap.set(ornament, {scale: 0, rotation: -180});
    gsap.set(divider, {scaleX: 0});
    gsap.set(subtitle, {y: 20});
    gsap.set(heading, {color: 'var(--color-white)'});
  });
}

// --- Slide 1: Intro Setup ---

function setupIntroSlide() {
  var slide = document.querySelector('[data-slide="1"]');
  if (!slide) return;

  var title = slide.querySelector('.intro__title');
  var text = slide.querySelector('.intro__text');
  var ship = slide.querySelector('.intro__ship');
  var cliffhanger = slide.querySelector('.intro__cliffhanger');

  // Hide spacebar-triggered elements (title stays visible)
  gsap.set([text, ship, cliffhanger], {autoAlpha: 0});

  registerSlideTimeline(1, function () {
    var tl = gsap.timeline({paused: true});

    // Step 1: Body text fades in + ship sails in from the right
    tl.addLabel('step1')
      .to(text, {
        autoAlpha: 1,
        y: 0,
        duration: 0.6,
        ease: 'power2.out',
      })
      .to(
        ship,
        {
          autoAlpha: 1,
          x: 0,
          scale: 1,
          duration: 1,
          ease: 'power3.out',
        },
        '-=0.4'
      )

    // Step 2: Cliffhanger pops in
      .addLabel('step2')
      .to(cliffhanger, {
        autoAlpha: 1,
        y: 0,
        duration: 0.6,
        ease: 'back.out(1.4)',
      });

    // Set pre-animation states
    gsap.set(text, {y: 20});
    gsap.set(ship, {x: 200, scale: 0.85});
    gsap.set(cliffhanger, {y: 20});

    return tl;
  });

  // Leave animation: ship sails away, then text fades out
  slideLeaveAnimations.set(1, function (direction) {
    var tl = gsap.timeline();

    // Ship sails off in the direction of navigation
    var shipExitX = direction > 0 ? -window.innerWidth : window.innerWidth;

    tl.to(ship, {
      x: shipExitX,
      rotation: direction > 0 ? -3 : 3,
      scale: 0.7,
      duration: 0.9,
      ease: 'power2.in',
    })
    .to(
      [title, text, cliffhanger],
      {
        autoAlpha: 0,
        y: 20,
        duration: 0.3,
        ease: 'power1.in',
        stagger: 0.05,
      },
      '-=0.5'
    );

    return tl;
  });

  // Reset: restore initial hidden states and positions
  slideResetFunctions.set(1, function () {
    gsap.set([text, ship, cliffhanger], {autoAlpha: 0});
    gsap.set(text, {y: 20});
    gsap.set(ship, {x: 200, scale: 0.85, rotation: 0});
    gsap.set(cliffhanger, {y: 20});
    gsap.set(title, {autoAlpha: 1, y: 0});
  });
}

// --- Slide 2: Water Activities Setup ---

function setupWaterSlide() {
  var slide = document.querySelector('[data-slide="2"]');
  if (!slide) return;

  var subtitle = slide.querySelector('.water__subtitle');
  var cards = slide.querySelectorAll('.water__card');
  var topRow = [cards[0], cards[1], cards[2]];
  var bottomRow = [cards[3], cards[4], cards[5]];
  var footer = slide.querySelector('.water__footer');

  // Title visible by default, hide everything else
  gsap.set([subtitle], {autoAlpha: 0});
  gsap.set(cards, {autoAlpha: 0, y: 30, scale: 0.9});
  gsap.set(footer, {autoAlpha: 0});

  registerSlideTimeline(2, function () {
    var tl = gsap.timeline({paused: true});

    // Step 1: Subtitle + first row of cards pop in
    tl.addLabel('step1')
      .to(subtitle, {
        autoAlpha: 1,
        duration: 0.4,
        ease: 'power1.out',
      })
      .to(topRow, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: 'back.out(1.3)',
        stagger: 0.12,
      }, '-=0.1')

    // Step 2: Second row of cards
      .addLabel('step2')
      .to(bottomRow, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.5,
        ease: 'back.out(1.3)',
        stagger: 0.12,
      })

    // Step 3: Footer teaser
      .addLabel('step3')
      .to(footer, {
        autoAlpha: 1,
        y: 0,
        duration: 0.6,
        ease: 'power2.out',
      });

    gsap.set(footer, {y: 15});

    return tl;
  });

  // Reset
  slideResetFunctions.set(2, function () {
    gsap.set(subtitle, {autoAlpha: 0});
    gsap.set(cards, {autoAlpha: 0, y: 30, scale: 0.9});
    gsap.set(footer, {autoAlpha: 0, y: 15});
  });
}

// --- Slide 3: Ports Timeline Setup ---

function setupPortsSlide() {
  var slide = document.querySelector('[data-slide="3"]');
  if (!slide) return;

  var intro = slide.querySelector('.ports__intro');
  var stops = Array.from(slide.querySelectorAll('.ports__stop'));
  var skipped = slide.querySelector('#portsSkipped');
  var viewport = slide.querySelector('.ports__viewport');

  // Layout: Barcelona pinned at slot 0, dots at slot 1 (when needed),
  // then 2 rolling stops at slots 2-3. Total 4 slots used.
  var SLOT_HEIGHT = 120;
  var TOP_OFFSET = 0;
  var portsStep = -1;

  function slotY(slotIndex) {
    return TOP_OFFSET + slotIndex * SLOT_HEIGHT;
  }

  function getEnterX(stop) {
    return stop.classList.contains('ports__stop--right') ? 60 : -60;
  }

  function resetAll() {
    portsStep = -1;
    // Restore slide visibility (may have been faded by vertical transition to slide 4)
    gsap.set(slide, {autoAlpha: 1, y: 0});
    gsap.set(intro, {autoAlpha: 0});
    gsap.set(skipped, {autoAlpha: 0});
    // Barcelona (stop 0) always visible, pushed up so circle covers line start
    gsap.set(stops[0], {autoAlpha: 1, x: 0, top: -15});
    for (var i = 1; i < stops.length; i++) {
      gsap.set(stops[i], {autoAlpha: 0, x: getEnterX(stops[i]), top: slotY(4)});
    }
  }

  resetAll();

  function advancePorts() {
    if (state.isAnimating) return;

    portsStep++;

    // Step 0: show intro
    if (portsStep === 0) {
      gsap.to(intro, {autoAlpha: 1, duration: 0.4, ease: 'power1.out'});
      return;
    }

    // stopIndex starts at 1 (Barcelona is 0 and always visible)
    var stopIndex = portsStep;
    if (stopIndex >= stops.length) { goNext(); return; }

    state.isAnimating = true;
    var tl = gsap.timeline({
      onComplete: function () { state.isAnimating = false; },
    });

    var newStop = stops[stopIndex];

    if (stopIndex <= 2) {
      // Stops 1-2: enter at slots 1-2, no dots needed yet
      gsap.set(newStop, {top: slotY(stopIndex) + 30, x: getEnterX(newStop)});
      tl.to(newStop, {
        autoAlpha: 1, top: slotY(stopIndex), x: 0,
        duration: 0.6, ease: 'power2.out',
      });

    } else {
      // stopIndex >= 3: Barcelona at 0, dots at 1, prev at 2, new at 3
      var prevStop = stops[stopIndex - 1];

      gsap.set(skipped, {top: slotY(1)});
      if (stopIndex === 3) {
        // First time dots appear — slide out stop at slot 1, reposition stop at slot 2
        tl.to(stops[1], {
          autoAlpha: 0, top: -SLOT_HEIGHT,
          duration: 0.4, ease: 'power2.in',
        }, 0);
        tl.to(prevStop, {
          top: slotY(2),
          duration: 0.5, ease: 'power2.inOut',
        }, 0);
        tl.to(skipped, {autoAlpha: 1, duration: 0.3, ease: 'power1.out'}, 0.1);
      } else {
        // Subsequent: old prev exits, current prev moves to slot 2
        var oldPrev = stops[stopIndex - 2];
        tl.to(oldPrev, {
          autoAlpha: 0, top: -SLOT_HEIGHT,
          duration: 0.4, ease: 'power2.in',
        }, 0);
        tl.to(prevStop, {
          top: slotY(2),
          duration: 0.5, ease: 'power2.inOut',
        }, 0);
      }

      // New stop enters at slot 3
      gsap.set(newStop, {top: slotY(3) + 30, x: getEnterX(newStop)});
      tl.to(newStop, {
        autoAlpha: 1, top: slotY(3), x: 0,
        duration: 0.6, ease: 'power2.out',
      }, 0.15);
    }
  }

  slideTimelines.set(3, {
    timeline: gsap.timeline({paused: true}),
    stepIndex: 0,
    labels: [],
    custom: advancePorts,
  });

  slideResetFunctions.set(3, resetAll);
}

// --- Slide 4: Price Setup ---

function setupPriceSlide() {
  var slide = document.querySelector('[data-slide="5"]');
  if (!slide) return;

  var layout = slide.querySelector('.price__layout');
  var subtitle = slide.querySelector('.price__subtitle');
  var cards = slide.querySelectorAll('.price__card');
  var bars = slide.querySelectorAll('.price__bar-fill');
  var includes = slide.querySelector('.price__includes');

  // Initial state: everything hidden, layout shifted down for vertical entrance
  function resetAll() {
    gsap.set(layout, {y: window.innerHeight, autoAlpha: 1});
    gsap.set(subtitle, {autoAlpha: 0});
    gsap.set(cards, {autoAlpha: 0, y: 30, scale: 0.9});
    gsap.set(includes, {autoAlpha: 0, y: 20});
    bars.forEach(function (bar) {
      gsap.set(bar, {width: '0%'});
    });
  }

  resetAll();

  // Instant horizontal transition from slide 3 to 4 (and back)
  slideTransitionDurations.set('4-5', 0);
  slideTransitionDurations.set('5-4', 0);

  // Leave animation for slide 4 (food) going forward to slide 5 (price): fade content up
  var existingLeave4 = slideLeaveAnimations.get(4);
  slideLeaveAnimations.set(4, function (direction) {
    if (direction > 0) {
      var foodSlide = document.querySelector('[data-slide="4"]');
      var tl = gsap.timeline();
      tl.to(foodSlide, {
        autoAlpha: 0,
        y: -80,
        duration: 0.5,
        ease: 'power2.in',
      });
      return tl;
    }
    // Going back — use existing or default
    if (existingLeave4) return existingLeave4(direction);
    var tl = gsap.timeline();
    tl.to({}, {duration: 0.01});
    return tl;
  });

  // Custom enter: slide up from bottom
  slideEnterAnimations.set(5, function () {
    gsap.to(layout, {
      y: 0,
      duration: 0.7,
      ease: 'power3.out',
    });
  });

  // Leave animation for slide 5 (price) going back to slide 4 (food): slide back down
  slideLeaveAnimations.set(5, function (direction) {
    var tl = gsap.timeline();
    if (direction < 0) {
      // Going back — slide price down, restore food
      var foodSlide = document.querySelector('[data-slide="4"]');
      tl.to(layout, {
        y: window.innerHeight,
        duration: 0.6,
        ease: 'power2.in',
      });
      tl.set(foodSlide, {autoAlpha: 1, y: 0});
    } else {
      // Going forward — normal fade
      tl.to(layout, {
        autoAlpha: 0,
        duration: 0.3,
        ease: 'power1.in',
      });
    }
    return tl;
  });

  // Spacebar timeline: title visible, then cards, then includes
  registerSlideTimeline(5, function () {
    var tl = gsap.timeline({paused: true});

    // Step 1: subtitle + cards pop in
    tl.addLabel('step1')
      .to(subtitle, {autoAlpha: 1, duration: 0.3, ease: 'power1.out'})
      .to(cards, {
        autoAlpha: 1, y: 0, scale: 1,
        duration: 0.5, ease: 'back.out(1.2)',
        stagger: 0.12,
      }, '-=0.1')

    // Step 2: value bars fill
      .addLabel('step2');

    bars.forEach(function (bar) {
      tl.to(bar, {
        width: bar.getAttribute('data-width') + '%',
        duration: 0.8,
        ease: 'power2.out',
      }, 'step2');
    });

    // Step 3: includes section
    tl.addLabel('step3')
      .to(includes, {
        autoAlpha: 1, y: 0,
        duration: 0.5, ease: 'power2.out',
      });

    return tl;
  });

  slideResetFunctions.set(5, resetAll);
}

// --- Slide 6: Casino Setup ---

function setupCasinoSlide() {
  var slide = document.querySelector('[data-slide="6"]');
  if (!slide) return;

  var machine = slide.querySelector('.casino__machine');
  var jackpot = slide.querySelector('#casinoJackpot');
  var tips = slide.querySelector('#casinoTips');
  var tipItems = tips.querySelectorAll('li');
  var lever = slide.querySelector('#casinoLever');
  var knob = slide.querySelector('.casino__lever-knob');
  var stick = slide.querySelector('.casino__lever-stick');
  var strips = slide.querySelectorAll('.casino__strip');

  // Each strip has 21 symbols, banana is the last one (index 20)
  // Symbol height = 80px, we want to land showing the last symbol
  var SYMBOL_HEIGHT = 80;
  var TOTAL_SYMBOLS = 21;
  var TARGET_Y = -(TOTAL_SYMBOLS - 1) * SYMBOL_HEIGHT; // land on last banana

  var casinoStep = -1;

  function resetAll() {
    casinoStep = -1;
    gsap.set(machine, {autoAlpha: 0, scale: 0.9});
    gsap.set(jackpot, {autoAlpha: 0});
    jackpot.classList.remove('casino__jackpot--active');
    gsap.set(tips, {autoAlpha: 0});
    gsap.set(tipItems, {autoAlpha: 0, x: -20});
    // Reset strips to show first symbol
    strips.forEach(function (strip) {
      gsap.set(strip, {y: 0});
    });
    // Reset lever
    gsap.set(knob, {top: -60});
    gsap.set(stick, {scaleY: 1});
  }

  resetAll();

  function advanceCasino() {
    if (state.isAnimating) return;

    casinoStep++;

    if (casinoStep === 0) {
      // Step 1: Machine appears
      state.isAnimating = true;
      gsap.to(machine, {
        autoAlpha: 1,
        scale: 1,
        duration: 0.6,
        ease: 'back.out(1.3)',
        onComplete: function () { state.isAnimating = false; },
      });

    } else if (casinoStep === 1) {
      // Step 2: Pull lever + spin reels + jackpot
      state.isAnimating = true;
      var tl = gsap.timeline({
        onComplete: function () { state.isAnimating = false; },
      });

      // Pull lever down
      tl.to(knob, {top: 0, duration: 0.3, ease: 'power2.in'})
        .to(stick, {scaleY: 0.5, duration: 0.3, ease: 'power2.in'}, '<');

      // Spin reels — staggered stops, all land on banana
      strips.forEach(function (strip, i) {
        var duration = 1.5 + i * 0.6; // 1.5s, 2.1s, 2.7s
        tl.to(strip, {
          y: TARGET_Y,
          duration: duration,
          ease: 'power2.out',
        }, 0.4); // all start at same time, stop staggered
      });

      // Lever springs back
      tl.to(knob, {top: -60, duration: 0.5, ease: 'elastic.out(1, 0.4)'}, 0.6)
        .to(stick, {scaleY: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)'}, 0.6);

      // Jackpot appears after last reel stops (5 reels now, last at ~4.5s)
      var lastReelEnd = 0.4 + 1.5 + (strips.length - 1) * 0.6;
      tl.to(jackpot, {
        autoAlpha: 1,
        scale: 1,
        duration: 0.5,
        ease: 'back.out(2)',
      }, lastReelEnd + 0.2)
        .call(function () {
          jackpot.classList.add('casino__jackpot--active');
        }, null, lastReelEnd + 0.2);

      // Pre-set jackpot scale
      gsap.set(jackpot, {scale: 0.5});

    } else if (casinoStep === 2) {
      // Step 3: Tips appear one by one
      state.isAnimating = true;
      gsap.to(tips, {autoAlpha: 1, duration: 0.3});
      gsap.to(tipItems, {
        autoAlpha: 1,
        x: 0,
        duration: 0.4,
        ease: 'power2.out',
        stagger: 0.15,
        onComplete: function () { state.isAnimating = false; },
      });

    } else {
      goNext();
    }
  }

  slideTimelines.set(6, {
    timeline: gsap.timeline({paused: true}),
    stepIndex: 0,
    labels: [],
    custom: advanceCasino,
  });

  slideResetFunctions.set(6, resetAll);
}

// --- Slide 6: Food & Drink Setup ---

function setupFoodSlide() {
  var slide = document.querySelector('[data-slide="4"]');
  if (!slide) return;

  var foodTitle = slide.querySelector('.food__title');
  var foodLeft = slide.querySelector('.food__left');
  var foodRight = slide.querySelector('.food__right');
  var foodLayout = slide.querySelector('.food__layout');
  var foodInfo = slide.querySelector('.food__info');
  var dayTitle = slide.querySelector('.food__day-title');
  var events = slide.querySelectorAll('.food__event');
  var total = slide.querySelector('.food__total');

  gsap.set(foodInfo, {autoAlpha: 0, x: -30});
  gsap.set(dayTitle, {autoAlpha: 0});
  gsap.set(events, {autoAlpha: 0, x: 20});
  gsap.set(total, {autoAlpha: 0});
  gsap.set(foodRight, {autoAlpha: 0});

  registerSlideTimeline(4, function () {
    var tl = gsap.timeline({paused: true});

    // Step 1: Food info slides in from left
    tl.addLabel('step1')
      .to(foodInfo, {
        autoAlpha: 1, x: 0,
        duration: 0.5, ease: 'power2.out',
      });

    // Step 2: Hide left column + title, show daily plan centered
    tl.addLabel('step2')
      .to(foodLeft, {
        autoAlpha: 0, x: -40,
        duration: 0.4, ease: 'power2.in',
      })
      .to(foodLayout, {
        justifyContent: 'center',
        duration: 0.01,
      })
      .to(foodRight, {
        autoAlpha: 1,
        duration: 0.5, ease: 'power1.out',
      })
      .to(dayTitle, {autoAlpha: 1, duration: 0.3, ease: 'power1.out'}, '-=0.3')
      .to(events, {
        autoAlpha: 1, x: 0,
        duration: 0.3, ease: 'power2.out',
        stagger: 0.08,
      }, '-=0.2');

    // Step 3: Total summary
    tl.addLabel('step3')
      .to(total, {
        autoAlpha: 1,
        duration: 0.4, ease: 'power1.out',
      });

    return tl;
  });

  slideResetFunctions.set(4, function () {
    // Restore slide visibility (may have been faded by vertical transition to price)
    gsap.set(slide, {autoAlpha: 1, y: 0});
    gsap.set(foodLeft, {autoAlpha: 1, x: 0});
    gsap.set(foodRight, {autoAlpha: 0});
    gsap.set(foodLayout, {justifyContent: ''});
    gsap.set(foodInfo, {autoAlpha: 0, x: -30});
    gsap.set(dayTitle, {autoAlpha: 0});
    gsap.set(events, {autoAlpha: 0, x: 20});
    gsap.set(total, {autoAlpha: 0});
  });
}

// --- Initialization ---

function init() {
  // Set initial progress
  gsap.set(progressBar, {
    width: (1 / state.totalSlides) * 100 + '%',
  });

  updateUI();
  setupTitleSlide();
  setupIntroSlide();
  setupWaterSlide();
  setupPortsSlide();
  setupPriceSlide();
  setupCasinoSlide();
  setupFoodSlide();
}

// Wait for fonts then initialize
document.fonts.ready.then(init);
