//Enable ACD module
require(Modules.ACD);

let request;
let originalCall;
let callerid;
let statusInterval;

VoxEngine.addEventListener(AppEvents.CallAlerting, handleInboundCall);

// Handle inbound call
function handleInboundCall(e) {
  originalCall = e.call;
  callerid = e.callerid;
  // Add event listeners
  originalCall.addEventListener(CallEvents.Connected, handleCallConnected);
  originalCall.addEventListener(CallEvents.PlaybackFinished, handlePlaybackFinished);
  originalCall.addEventListener(CallEvents.Failed, cleanup);
  originalCall.addEventListener(CallEvents.Disconnected, cleanup);
  // Answer call
  originalCall.answer();
}

// Terminate call and session
function cleanup(e) {
  if (request) {
    // Remove call from queue
    request.cancel();
    request = null;
  }
  // terminate session
  VoxEngine.terminate();
}

// Play music after TTS finish
function handlePlaybackFinished(e) {
  e.call.startPlayback('http://cdn.voximplant.com/toto.mp3');
}

// Get suffix for the number
function ordinal_suffix_of(i) {
  const j = i % 10,
    k = i % 100;
  if (j === 1 && k !== 11)
    return i + 'st';
  else if (j === 2 && k !== 12)
    return i + 'nd';
  else if (j === 3 && k !== 13)
    return i + 'rd';
  return i + 'th';
}

// Call connected
function handleCallConnected(e) {
  // Put the call into the queue 'MainQueue'
  request = VoxEngine.enqueueACDRequest('helpers', callerid);

  // Get call status in queue after it was put in the queue
  request.addEventListener(ACDEvents.Queued, (acdevent) => {
    request.getStatus();
  });

  // Notify caller about his position in the queue
  request.addEventListener(ACDEvents.Waiting, (acdevent) => {
    const minutesLeft = acdevent.ewt + 1;
    let minutesWord = ' minute.';
    if (minutesLeft > 1) {
      minutesWord = ' minutes.';
    }
    originalCall.say(`You are ${ordinal_suffix_of(acdevent.position)} `
      +`in a queue. Represetative will answer you in ${(acdevent.ewt + 1)} ${minutesWord}`, 
      {'language': VoiceList.Amazon.en_US_Joanna});
  });

  // Connect caller with operator
  request.addEventListener(ACDEvents.OperatorReached, (acdevent) => {
    VoxEngine.sendMediaBetween(acdevent.operatorCall, originalCall);
    acdevent.operatorCall.addEventListener(CallEvents.Disconnected, VoxEngine.terminate);
    clearInterval(statusInterval);
  });

  // No operators are available
  request.addEventListener(ACDEvents.Offline, (acdevent) => {
    originalCall.say('All operators are currently offline, please try to call again later.',
      {'language': VoiceList.Amazon.en_US_Joanna});
    originalCall.addEventListener(CallEvents.PlaybackFinished, (e) => {
      VoxEngine.terminate();
    });
  });

  // Get current call status in a queue every 30 seconds
  statusInterval = setInterval(request.getStatus, 30000);
}
