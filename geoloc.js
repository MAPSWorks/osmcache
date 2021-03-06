var GEOLocation = function()
{
    var _this = this;
    var m_timeout = 5000;
    var m_prevPosTime = undefined;
    var m_avgCount = 10;
    var m_pos = [ ];
    var m_GEOWebSocketURL = null;

    var m_watchId = null;
    var m_timerId = null;
    var m_ws = null;
    var m_wsTimer = null;
    var m_wsPingTimer = null;
    var m_destroying = false;

    var m_wsPingCheckTimeout = 1000;
    var m_wsInitialTimeout = 2000;
    var m_wsRestartTimeout = 5000;
    var m_wsConnCheckTimeout = 5000;

    this.onPositionError = function(errCode, errMsg) { }
    this.onSmoothedPosition = function(longitude, latitude) { }
    this.onImmediatePosition = function(longitude, latitude) { }

    var averagePositions = function()
    {
        var weightSum = 0;
        var latSum = 0;
        var lonSum = 0;
        for (var i = 0 ; i < m_pos.length ; i++)
        {
            var w = 1.0/(m_pos[i].acc + 0.001);

            weightSum += w;
            latSum += w*m_pos[i].lat;
            lonSum += w*m_pos[i].lon;
        }
        latSum /= weightSum;
        lonSum /= weightSum;

        setTimeout(function() { _this.onSmoothedPosition(lonSum, latSum); }, 0);

        m_pos = [ ];
    }

    var positionError = function(e)
    {
        setTimeout(function() { _this.onPositionError(e.code, e.message); }, 0);
    }

    var positionCallback = function(pos)
    {
        //console.log(pos);
        //console.log("lon = " + pos.coords.longitude + " lat = " + pos.coords.latitude + " acc = " + pos.coords.accuracy);
        m_pos.push({
            lon: pos.coords.longitude,
            lat: pos.coords.latitude,
            acc: pos.coords.accuracy,
            t: pos.timestamp,
        });

        if (m_pos.length >= m_avgCount)
            averagePositions();

        var lon = pos.coords.longitude;
        var lat = pos.coords.latitude;
        setTimeout(function() { _this.onImmediatePosition(lon, lat); }, 0);
    }

    // Called by the timer, make sure a new position is passed to the onPosition
    // if cached for too long
    var positionUpdateCallback = function()
    {
        if (m_pos.length == 0)
            return;

        if (Date.now() - m_pos[0].t > m_timeout)
            averagePositions();
    }

    var webSocketPingAndCheck = function()
    {
        if (m_ws == null)
            return;

        try { m_ws.send("PING"); } catch(e) { }
        
        var now = Date.now();
        if (now - m_ws.geoLastReceiveTime > m_wsConnCheckTimeout) // haven't heard from the server in 5 seconds, assume something is wrong
        {
            try { m_ws.close(); } catch(e) { } // should generate a close event after which we'll restart
        }
    }

    var websocketStart = function()
    {
        if (m_destroying)
            return;
        m_wsTimer = null;

        console.log("Trying to open websocket connection to " + m_GEOWebSocketURL);
        m_ws = new WebSocket(m_GEOWebSocketURL);
        m_ws.geoLastReceiveTime = Date.now();

        if (m_wsPingTimer == null)
            m_wsPingTimer = setInterval(webSocketPingAndCheck, m_wsPingCheckTimeout);

        m_ws.addEventListener("open", function(evt)
        {
            console.log("Websocket open");
        });
        m_ws.addEventListener("message", function(evt)
        {
            var msg = evt.data;
            console.log("Got message: " + msg);
            var obj = JSON.parse(msg);

            if (obj)
            {
                m_ws.geoLastReceiveTime = Date.now();
                positionCallback({ 
                    "coords": { 
                        "latitude": obj.latitude, 
                        "longitude": obj.longitude,
                        "accuracy": obj.accuracy,
                    },
                    "timestamp": obj.timestamp
                });
            }
        });
        m_ws.addEventListener("error", function(evt)
        {
            console.log("Websocket error");
            if (m_wsTimer == null)
                m_wsTimer = setTimeout(websocketStart, m_wsRestartTimeout);
            m_ws = null;
        });
        m_ws.addEventListener("close", function(evt)
        {
            console.log("Websocket closed");
            if (m_wsTimer == null)
                m_wsTimer = setTimeout(websocketStart, m_wsRestartTimeout);
            m_ws = null;
        });
    }

    var construct = function()
    {
        if (location.hash)
            m_GEOWebSocketURL = location.hash.substr(1);

        if (m_GEOWebSocketURL)
        {
            m_wsTimer = setTimeout(websocketStart, m_wsInitialTimeout);
        }
        else
        {
            if (!("geolocation" in navigator))
                throw "Geolocation API not present";

            var options = { enableHighAccuracy: true };
            m_watchId = navigator.geolocation.watchPosition(positionCallback, positionError, options);
        }

        m_timerId = setInterval(function() { positionUpdateCallback(); }, 1000);
    }

    this.destroy = function()
    {
        m_destroying = true;
        if (m_timerId != null)
        {
            clearInterval(m_timerId);
            m_timerId = null;
        }
        if (m_wsTimer != null)
        {
            clearTimeout(m_wsTimer);
            m_wsTimer = null;
        }
        if (m_wsPingTimer != null)
        {
            clearInterval(m_wsPingTimer);
            m_wsPingTimer = null;
        }
        if (m_watchId != null)
        {
            navigator.geolocation.clearWatch(m_watchId);
            m_watchId = null;
        }
        if (m_ws)
        {
            try { m_ws.close(); } catch(e) { }
            m_ws = null;
        }
    }

    this.clearTarget = function()
    {
        if (m_ws != null)
            m_ws.send("CLEARTARGET");
    }

    this.setTarget = function(lon, lat)
    {
        var obj = { "longitude": lon, "latitude": lat };
        if (m_ws != null)
            m_ws.send(JSON.stringify(obj));
    }

    construct();
}
