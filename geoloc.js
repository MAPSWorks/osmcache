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

    var construct = function()
    {
        if (location.hash)
            m_GEOWebSocketURL = location.hash.substr(1);

        if (m_GEOWebSocketURL)
        {
            m_ws = new WebSocket(m_GEOWebSocketURL);
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
            });
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
        if (m_timerId != null)
        {
            clearInterval(m_timerId);
            m_timerId = null;
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

    construct();
}
