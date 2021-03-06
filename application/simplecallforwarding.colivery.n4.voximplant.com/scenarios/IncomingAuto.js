// This script is processing incoming calls
// it will enqueue the incoming call in the "helpers"-Queue.
// If no operator is reachead within "timeout_dur" milli seconds or the Queue is offline,
// the call will be redirected to a GoogleDialogflow bot


require(Modules.AI)
require(Modules.ACD);


var diaglogflow, call, hangup
const timeout_dur = 10000;
const VOICE_MEN = VoiceList.Google.de_DE_Wavenet_B;

//inbound call processing
VoxEngine.addEventListener(AppEvents.CallAlerting, (e) => {
    call = e.call;
    const incCallerId = e.callerid;

    call.answer();
    call.addEventListener(CallEvents.Failed, VoxEngine.terminate);
    call.addEventListener(CallEvents.Disconnected, VoxEngine.terminate);
    call.addEventListener(CallEvents.Connected, () => {
        const request = VoxEngine.enqueueACDRequest("helpers", incCallerId);
        request.addEventListener(ACDEvents.Queued, function (a) {
            request.getStatus();
        });
        // No operator connected
        request.addEventListener(ACDEvents.Offline, function (a) {
            say("Hallo, wilkommen zu Machbarschaft. Sie werden gleich verbunden.", VOICE_MEN); 
            call.addEventListener(CallEvents.PlaybackFinished, function(b) {
              // if no operators are present, redirect to dialogflow
              noOperator(incCallerId);
            });
        });
        
        request.addEventListener(ACDEvents.Waiting, function (a) {          
          say("Hallo, wilkommen zu Machbarschaft. Sie werden gleich verbunden.", VOICE_MEN);
        });

        request.addEventListener(ACDEvents.QueueFull, function(a) {
          say("Momentan sind alle Leitungen belegt. Probieren Sie es spaeter noch einmal");
          VoxEngine.terminate();
          request.removeEventListener(ACDEvents);
        })

        call.addEventListener(CallEvents.PlaybackFinished, function (e) {
            call.startPlayback("http://cdn.voximplant.com/toto.mp3");  
        });
        
        request.addEventListener(ACDEvents.OperatorReached, e => {
            evtFired = true;
            const out = e.operatorCall;
            VoxEngine.sendMediaBetween(call, out);
        });

        //timeout function
        //if no operator reached connect do dialogflow
        var evtFired = false;
        setTimeout(function(){
            if(!evtFired) {
                request.removeEventListener(ACDEvents);
                noOperator(incCallerId);
            }
        }, timeout_dur);
        })
});

/**
 * Say Hello with specific voice
 * 
 * @param voice, optional
 */
function say(text, voice) {
  if (!voice) {
    voice = VOICE_MEN;
  }
  call.say(text,
          {
            "language": voice,
            "ttsOptions": {
              "pitch": "high",
              "volume": "loud",
              "rate": "x-slow"
            }
          });
}

/**
 * No operator connected, redirect to dialogflow
 */
function noOperator(callerId){
  if(callerId===""){
    say("Bitte teile uns deine Nummer mit unter der wir dich erreichen.");
    // TODO Abfrage und Interpretation
  }
  dfonCallConnected(callerId);
}



//FUNCTIONS
//Dialogflow
function dfonCallConnected(callId) {
  // Create Dialogflow object
 dialogflow = AI.createDialogflow({
   lang: DialogflowLanguage.GERMAN
 })
 dialogflow.addEventListener(AI.Events.DialogflowResponse, dfonDialogflowResponse)
    // Sending WELCOME event to let the agent says a welcome message
    dialogflow.sendQuery({event : {name: "WELCOME", language_code:"de"}})
    dialogflow.sendQuery({context: {
            name: "test",
            parameters: {tet_param: "test"},
            lifespanCount: 20
        }})
    // Playback marker used for better user experience
    dialogflow.addMarker(0)

    // Start sending media from Dialogflow to the call
    dialogflow.sendMediaTo(call)
    dialogflow.addEventListener(AI.Events.DialogflowPlaybackFinished, (e) => {
      // Dialogflow TTS playback finished. Hangup the call if hangup flag was set to true
      if (hangup) call.hangup()
    })
    dialogflow.addEventListener(AI.Events.DialogflowPlaybackStarted, (e) => {
      // Dialogflow TTS playback started
    })
    dialogflow.addEventListener(AI.Events.DialogflowPlaybackMarkerReached, (e) => {
      // Playback marker reached - start sending audio from the call to Dialogflow
      call.sendMediaTo(dialogflow)
    })
}

// Handle Dialogflow responses
function dfonDialogflowResponse(e) {
  // If DialogflowResponse with queryResult received - the call stops sending media to Dialogflow
  // in case of response with queryResult but without responseId we can continue sending media to dialogflow
  if (e.response.queryResult !== undefined && e.response.responseId === undefined) {
    call.sendMediaTo(dialogflow)
  } else if (e.response.queryResult !== undefined && e.response.responseId !== undefined) {
   // Do whatever required with e.response.queryResult or e.response.webhookStatus
        // If we need to hangup because end of conversation has been reached
        if (e.response.queryResult.diagnosticInfo !== undefined &&
           e.response.queryResult.diagnosticInfo.end_conversation == true) {
           hangup = true
        }

    // Telephony messages arrive in fulfillmentMessages array
    if (e.response.queryResult.fulfillmentMessages != undefined) {
     e.response.queryResult.fulfillmentMessages.forEach((msg) => {
       if (msg.platform !== undefined && msg.platform === "TELEPHONY") processTelephonyMessage(msg)
     })
   }
  }
}

// Process telephony messages from Dialogflow
function dfprocessTelephonyMessage(msg) {
  // Transfer call to msg.telephonyTransferCall.phoneNumber
  if (msg.telephonyTransferCall !== undefined) {
   /**
    * Example:
    * dialogflow.stop()
    * let newcall = VoxEngine.callPSTN(msg.telephonyTransferCall.phoneNumber, "put verified CALLER_ID here")
    * VoxEngine.easyProcess(call, newcall)
    */
  }
  // Synthesize speech from msg.telephonySynthesizeSpeech.text
  if (msg.telephonySynthesizeSpeech !== undefined) {
    // See the list of available TTS languages at https://voximplant.com/docs/references/voxengine/language
    // Example:
    // if (msg.telephonySynthesizeSpeech.ssml !== undefined) call.say(msg.telephonySynthesizeSpeech.ssml, Language.Premium.US_ENGLISH_FEMALE)
    // else call.say(msg.telephonySynthesizeSpeech.text, Language.Premium.US_ENGLISH_FEMALE)
  }
  // Play audio file located at msg.telephonyPlayAudio.audioUri
  if (msg.telephonyPlayAudio !== undefined) {
    // audioUri contains Google Storage URI (gs://), we need to transform it to URL (https://)
    let url = msg.telephonyPlayAudio.audioUri.replace("gs://", "https://storage.googleapis.com/")
    // Example: call.startPlayback(url)
  }
}
