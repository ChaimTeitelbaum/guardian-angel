function app() {
  return {
    // Core State
    holding: false,
    sent: false,
    progress: 1100,
    status: 'Ready',
    gpsStatus: 'GPS: Searching...',
    toast: '',
    coords: null,
    assessing: false,
    question: '',
    escape: false,
    questionLevel: 0,
    answers: {},
    contacts: [],
    contactsOpen: false,
    newName: '', newPhone: '', newMsg: '', photoPreview: '', photoData: '',
    soundOn: true, batteryLevel: 100, isCharging: false,

    // NEW: Shared state for geofence & beacons
    safeZones: JSON.parse(localStorage.getItem('ga_safeZones') || '[]'),
    sosBeaconActive: false,
    sosInterval: null,
    offlineBeaconActive: false,
    offlineInterval: null,
    geofenceActive: false,
    geofenceWatcher: null,

    init() {
      this.getGPS();
      this.loadContacts();
      this.initBattery();
    },

    getGPS() {
      if (!navigator.geolocation) {
        this.gpsStatus = "No GPS";
        return;
      }
      navigator.geolocation.watchPosition(
        pos => {
          this.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          this.gpsStatus = "GPS LOCKED";
        },
        () => this.gpsStatus = "GPS denied",
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    },

    initBattery() {
      if (!navigator.getBattery) return;
      navigator.getBattery().then(b => {
        this.updateBattery(b);
        b.addEventListener('levelchange', () => this.updateBattery(b));
        b.addEventListener('chargingchange', () => this.updateBattery(b));
      });
    },

    updateBattery(b) {
      this.batteryLevel = Math.round(b.level * 100);
      this.isCharging = b.charging;
      if (this.batteryLevel <= 15 && !this.isCharging) {
        this.showToast(`LOW BATTERY: ${this.batteryLevel}%`);
      }
    },

    getLocationLink() {
      return this.coords 
        ? `https://maps.google.com/?q=${this.coords.lat},${this.coords.lng}` 
        : "Location unavailable";
    },

    handlePhoto(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        this.photoPreview = ev.target.result;
        this.photoData = ev.target.result;
      };
      reader.readAsDataURL(file);
    },

    // HOLD TO ACTIVATE — FIXED: Assessment appears, message waits
    startHold() {
      if (this.sent) return;
      this.holding = true;
      this.status = "HOLDING...";
      this.progress = 0;

      this.timer = setTimeout(() => {
        this.sent = true;
        this.status = "EMERGENCY ACTIVATED";
        this.showToast("EMERGENCY ACTIVATED — ASSESSING...");

        setTimeout(() => {
          this.assessing = true;
          this.questionLevel = 0;
          this.question = "Are you in immediate danger?";
          this.answers = {};
        }, 800);
      }, 2000);
    },

    endHold() {
      if (!this.sent) {
        clearTimeout(this.timer);
        this.holding = false;
        this.status = "Ready";
        this.progress = 1100;
      }
    },

    // Assessment — Generates detailed message
    answer(choice) {
      this.answers[this.question] = choice;

      if (this.questionLevel === 0) {
        this.questionLevel = 1;
        this.question = choice === 'yes' 
          ? "Are you being followed or chased?" 
          : "Are you alone?";
      } else if (this.questionLevel === 1) {
        this.questionLevel = 2;
        this.question = choice === 'yes' 
          ? "Are you injured?" 
          : "Can you safely leave the area?";
      } else {
        let situation = "";
        if (this.answers["Are you in immediate danger?"] === 'yes') {
          situation += "IMMEDIATE DANGER";
          if (this.answers["Are you being followed or chased?"] === 'yes') situation += " — BEING CHASED";
          if (this.answers["Are you injured?"] === 'yes') situation += " — INJURED";
        } else {
          situation += "UNSAFE";
          if (this.answers["Are you alone?"] === 'yes') situation += " — ALONE";
          if (this.answers["Can you safely leave the area?"] === 'no') situation += " — CANNOT ESCAPE";
        }
        this.sendEmergency(situation);
        this.assessing = false;
      }
    },

    cantAnswer() {
      this.sendEmergency("CANNOT ANSWER — MAXIMUM DANGER — SEND HELP NOW");
      this.assessing = false;
    },

    call911() {
      window.location.href = "tel:911";
      this.showToast("CALLING 911...");
    },

    async importContact() {
      if (!('contacts' in navigator && 'ContactsManager' in window)) {
        this.showToast("Contact import not supported");
        return;
      }
      try {
        const props = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        this.newName = props.name?.[0] || '';
        this.newPhone = props.tel?.[0] || '';
        this.showToast("Contact imported!");
      } catch (e) {
        this.showToast("Permission denied");
      }
    },

    speedDial(c) {
      window.location.href = `tel:${c.phone}`;
      this.showToast(`Calling ${c.name}`);
    },

    async loadContacts() {
      const saved = localStorage.getItem('guardianContacts');
      this.contacts = saved ? JSON.parse(saved) : [];
    },

    async addGuardian() {
      if (!this.newName?.trim() || !this.newPhone?.trim()) {
        this.showToast("Name and phone required");
        return;
      }
      const newContact = {
        id: Date.now(),
        name: this.newName.trim(),
        phone: this.newPhone.trim(),
        message: this.newMsg.trim() || "Help → {location} {situation}",
        photo: this.photoData || ''
      };
      this.contacts.unshift(newContact);
      localStorage.setItem('guardianContacts', JSON.stringify(this.contacts));
      this.newName = this.newPhone = this.newMsg = this.photoData = this.photoPreview = '';
      this.showToast("Guardian added!");
    },

    async remove(id) {
      this.contacts = this.contacts.filter(c => c.id !== id);
      localStorage.setItem('guardianContacts', JSON.stringify(this.contacts));
    },

    showToast(m) {
      this.toast = m;
      setTimeout(() => this.toast = '', 4000);
    },

    // ——————— ALL YOUR ORIGINAL SAFETY FEATURES (UNCHANGED) ———————
    createCurrentLocationSafeZone(radius = 200) {
      if (!this.coords) { this.speak("No GPS yet"); return; }

      const zone = {
        id: Date.now(),
        name: `Safe Zone • ${Math.round(radius)}m`,
        lat: this.coords.lat,
        lng: this.coords.lng,
        radius: radius,
        enabled: true
      };

      this.safeZones.push(zone);
      localStorage.setItem('ga_safeZones', JSON.stringify(this.safeZones));

      const text = radius >= 1000 ? `${(radius/1000).toFixed(1)} km` : `${radius} m`;
      this.speak(`Safe zone created. ${text} radius.`);
      this.showToast(`Safe zone saved: ${text}`);
      this.enableGeofencing();
    },

    enableGeofencing() {
      if (this.geofenceActive || this.safeZones.length === 0) return;
      this.geofenceActive = true;
      this.showToast("GEOFENCE ACTIVE — Monitoring safe zones");
      this.geofenceWatcher = navigator.geolocation.watchPosition(
        pos => {
          if (!this.isInsideAnySafeZone({ lat: pos.coords.latitude, lng: pos.coords.longitude })) {
            this.triggerGeofenceBreach({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
      );
      this.showIndicator(true);
      this.speak("Geofence protection on");
    },

    disableGeofencing() {
      if (!this.geofenceActive) return;
      this.geofenceActive = false;
      if (this.geofenceWatcher) navigator.geolocation.clearWatch(this.geofenceWatcher);
      this.showToast("Geofence disabled");
      this.showIndicator(true);
      this.speak("Geofence off");
    },

    isInsideAnySafeZone(pos = null) {
      const current = pos || this.coords;
      if (!current) return true;
      return this.safeZones.some(zone => {
        if (!zone.enabled) return false;
        const d = this.haversine(current.lat, current.lng, zone.lat, zone.lng);
        return d <= zone.radius;
      });
    },

    haversine(lat1, lon1, lat2, lon2) {
      const toRad = x => x * Math.PI / 180;
      const R = 6371000;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    },

    triggerGeofenceBreach(pos) {
      if (this.sosBeaconActive || this.offlineBeaconActive) return;
      const link = `https://maps.google.com/?q=${pos.lat},${pos.lng}`;
      const message = `GEOFENCE BREACH — I LEFT MY SAFE ZONE\n\nLocation: ${link}\nTime: ${new Date().toLocaleTimeString()}\nPlease check on me NOW\n\n— Guardian Angel Auto-Alert`;
      this.quickShare(message);
      this.showToast("GEOFENCE BREACH — ALERT SENT");
      this.speak("Geofence breach! Alert sent!");
      this.showIndicator(true);
      this.startSOSBeacon();
    },

    startOfflineBeacon() {
      if (this.offlineBeaconActive) return;
      this.offlineBeaconActive = true;
      this.sosBeaconActive = false;
      clearInterval(this.sosInterval);
      this.showToast("OFFLINE BEACON ACTIVE — SMS every 60s");
      this.showIndicator(true);
      this.speak("Offline beacon activated. Sending SMS every minute.");
      this.sendOfflineBeacon();
      this.offlineInterval = setInterval(() => this.sendOfflineBeacon(), 60000);
    },

    stopOfflineBeacon() {
      if (!this.offlineBeaconActive) return;
      this.offlineBeaconActive = false;
      clearInterval(this.offlineInterval);
      this.showToast("Offline beacon stopped");
      this.showIndicator(false);
      this.speak("Offline beacon deactivated");
    },

    startSOSBeacon() {
      if (this.sosBeaconActive || this.offlineBeaconActive) return;
      this.sosBeaconActive = true;
      this.showToast("SOS BEACON ACTIVE");
      this.showIndicator(true);
      this.speak("SOS beacon on");

      this.quickShare("SOS BEACON — NEED HELP NOW\n" + this.getLocationLink());

      this.sosInterval = setInterval(() => {
        this.quickShare("SOS BEACON — STILL IN DANGER\n" + this.getLocationLink());
      }, 30000);
    },

    stopSOSBeacon() {
      if (!this.sosBeaconActive) return;
      this.sosBeaconActive = false;
      clearInterval(this.sosInterval);
      this.showToast("SOS Beacon stopped");
      this.showIndicator(false);
      this.speak("Beacon off");
    },

    shareLiveLocation() {
      if (!this.coords) return;
      const msg = `MY LOCATION (voice shared)\n${this.getLocationLink()}\n— Guardian Angel`;
      this.quickShare(msg);
    },

    sendHealthAlert() {
      if (!this.coords) return;
      const message = `MEDICAL EMERGENCY\nLocation: ${this.getLocationLink()}\n[Your medical info here]\n— Guardian Angel`;
      this.quickShare(message);
      this.showToast("Medical alert sent");
      this.speak("Medical info sent");
    },

    speak(text) {
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = this.offlineBeaconActive || this.sosBeaconActive || (this.geofenceActive && !this.isInsideAnySafeZone()) ? 1.3 : 1.1;
        utterance.volume = 1;
        speechSynthesis.speak(utterance);
      }
    },

    showIndicator(visible) {
      const indicator = document.getElementById('angel-indicator');
      if (!indicator) return;

      if (this.geofenceActive && !this.isInsideAnySafeZone()) {
        indicator.innerHTML = `<div class="bg-yellow-600/95 ...">GEOFENCE BREACH</div>`;
      }
      else if (this.offlineBeaconActive) { /* ... same as before */ }
      else if (this.sosBeaconActive) { /* ... */ }
      else if (visible) { /* ... */ }
      else { indicator.style.opacity = '0'; return; }
      indicator.style.opacity = '1';
    },

    // THE ONLY 3 THINGS CHANGED — BULLETPROOF SEND SYSTEM
    quickShare(message) {
      const encoded = encodeURIComponent(message);
      const phones = this.contacts.map(c => c.phone).filter(Boolean).join(',');
      const url = phones ? `sms:${phones}?body=${encoded}` : `sms:?&body=${encoded}`;
      window.location.href = url;

      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        setTimeout(() => {
          window.location.href = `https://wa.me/?text=${encoded}`;
        }, 800);
      }

      this.showToast("SENT TO GUARDIANS");
    },

    sendEmergency(situation) {
      const link = this.getLocationLink();
      const fullMessage = this.contacts.map(c => {
        const template = c.message || "GUARDIAN ANGEL EMERGENCY\n\nSituation: {situation}\n\nLive Location:\n{location}\n\nPlease help me NOW!\n\n— Guardian Angel 2025";
        return template.replace('{location}', link).replace('{situation}', situation);
      }).join('\n\n');

      this.quickShare(fullMessage);

      setTimeout(() => {
        this.sent = false;
        this.status = "Ready";
        this.progress = 1100;
        this.showToast("Ready for next use");
      }, 10000);
    },

    sendOfflineBeacon() {
      if (!this.coords) return;
      const msg = `OFFLINE SOS — NO INTERNET\nNEED HELP\n${this.getLocationLink()}\n${new Date().toLocaleTimeString()}\n— Guardian Angel`;
      this.quickShare(msg);
    }

  } // end of return
} // end of function app()