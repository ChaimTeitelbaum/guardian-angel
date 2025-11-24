class Angel {
  constructor() {
    this.getApp = () => document.querySelector('[x-data]')?.__x?.$data;

    this.indicator = document.getElementById('angel-indicator');
    this.safeZones = JSON.parse(localStorage.getItem('ga_safeZones') || '[]');
    this.isOnline = () => navigator.onLine;

    if (!('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      console.log("Speech Recognition not supported");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.isListening = false;
    this.wakeWordDetected = false;
    this.silenceTimer = null;
    this.sosBeaconActive = false;
    this.sosInterval = null;
    this.offlineBeaconActive = false;
    this.offlineInterval = null;
    this.geofenceActive = false;
    this.geofenceWatcher = null;

    this.recognition.onresult = (event) => {
      let transcript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalTranscript += result[0].transcript;
        else transcript += result[0].transcript;
      }

      const fullText = (finalTranscript + ' ' + transcript).toLowerCase().trim();

      if (!this.wakeWordDetected && fullText.includes('hey angel')) {
        this.wakeUp();
        return;
      }

      if (this.isListening) {
        clearTimeout(this.silenceTimer);

        const app = this.getApp();
        const contacts = app?.contacts || [];

        if (fullText.includes('safe zone') || fullText.includes('set safe') || fullText.includes('create zone')) {
          const radiusMatch = fullText.match(/(\d+(?:\.\d+)?)\s*(meter|m|kilometer|km|mile|mi)/i);
          let radius = 200;
          if (radiusMatch) {
            let value = parseFloat(radiusMatch[1]);
            const unit = radiusMatch[2].toLowerCase();
            if (unit.includes('k') || unit.includes('kilo')) value *= 1000;
            else if (unit.includes('mile') || unit.includes('mi')) value *= 1609.34;
            radius = Math.max(50, Math.min(value, 10000));
          }
          this.createCurrentLocationSafeZone(radius);
          return;
        }

        if (fullText.includes('geofence on') || fullText.includes('protect area') || fullText.includes('watch zone')) {
          this.enableGeofencing();
        }
        else if (fullText.includes('geofence off') || fullText.includes('disable geofence') || fullText.includes('stop watching')) {
          this.disableGeofencing();
        }

        else if (fullText.includes('offline beacon') || fullText.includes('no internet') || fullText.includes('offline sos') || fullText.includes('go offline')) {
          this.startOfflineBeacon();
        }
        else if (fullText.includes('stop offline') || fullText.includes('offline off')) {
          this.stopOfflineBeacon();
        }
        else if (fullText.includes('sos beacon') || fullText.includes('start sos')) {
          this.startSOSBeacon();
        }
        else if (fullText.includes('stop beacon') || fullText.includes('sos off')) {
          this.stopSOSBeacon();
        }
        else if (fullText.includes('health check') || fullText.includes('medical info')) {
          this.sendHealthAlert();
        }
        else if (fullText.includes('call ')) {
          if (fullText.includes('911') || fullText.includes('emergency')) {
            window.location.href = "tel:911";
            app.showToast("CALLING 911");
            this.speak("Calling emergency");
            this.sleep();
          } else {
            const nameMatch = fullText.match(/(?:call|phone|ring) (.+)/i);
            if (nameMatch) {
              const name = nameMatch[1].trim().toLowerCase();
              const contact = contacts.find(c => 
                c.name.toLowerCase().includes(name) || 
                name.includes(c.name.toLowerCase())
              );
              if (contact) {
                window.location.href = `tel:${contact.phone}`;
                app.showToast(`Calling ${contact.name}`);
                this.speak(`Calling ${contact.name}`);
                this.sleep();
              }
            }
          }
        }
        else if (fullText.includes('panic') || fullText.includes('help') || fullText.includes('emergency')) {
          app.cantAnswer();
          this.speak("Maximum alert sent");
          this.sleep();
        }
        else if (fullText.includes('share location') || fullText.includes('my location')) {
          this.shareLiveLocation();
          this.speak("Location sent");
        }
        else if (fullText.includes('yes') || fullText.includes('yeah') || fullText.includes('yep')) {
          app.answer('yes');
          this.speak("Yes");
        }
        else if (fullText.includes('no') || fullText.includes('nope') || fullText.includes('nah')) {
          app.answer('no');
          this.speak("No");
        }
        else if (fullText.includes('cancel') || fullText.includes('stop') || fullText.includes('never mind')) {
          app.assessing = false;
          this.speak("Canceled");
          this.sleep();
        }

        this.silenceTimer = setTimeout(() => this.sleep(), 8000);
      }
    };

    this.recognition.onerror = (event) => {
      const app = this.getApp();
      if (app && (event.error === 'not-allowed' || event.error === 'service-not-allowed')) {
        app.showToast("Microphone access denied");
      }
    };

    this.recognition.onend = () => {
      if (this.wakeWordDetected || this.isListening || this.sosBeaconActive || this.offlineBeaconActive || this.geofenceActive) {
        try { this.recognition.start(); } catch(e) {}
      }
    };

    window.addEventListener('online', () => {
      const app = this.getApp();
      if (app) app.showToast("Back online");
      if (this.offlineBeaconActive) {
        this.stopOfflineBeacon();
        this.startSOSBeacon();
      }
    });

    window.addEventListener('offline', () => {
      const app = this.getApp();
      if (app) app.showToast("OFFLINE — Using SMS-only beacon");
    });

    try { this.recognition.start(); } catch(e) {}
  }

  wakeUp() {
    this.wakeWordDetected = true;
    this.isListening = true;
    const app = this.getApp();
    if (app) {
      app.angelListening = true;
      app.showToast("Angel is listening...");
    }
    this.showIndicator(true);
    this.speak("I'm here");
  }

  sleep() {
    if (this.sosBeaconActive || this.offlineBeaconActive || this.geofenceActive) return;
    this.isListening = false;
    this.wakeWordDetected = false;
    const app = this.getApp();
    if (app) app.angelListening = false;
    this.showIndicator(false);
  }
}

// Start Angel
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new Angel());
} else {
  new Angel();
}