// SPDX-License-Identifier: Apache-2.0
import java.util.HashMap;
import java.util.Map;
import me.jxl.kiosk.plugins.PluginHost;
import org.missing_foss.digitalrainclock.DigitalRainClockPlugin;

/** The plugin publishes its renderer at start, again only on a change, and nothing after stop. */
public final class DigitalRainClockTest {
    static final class Host implements PluginHost {
        int publications;
        String key, title, entry;
        Map<String, Object> options;
        public void publishScreensaverAsset(String key, String title, String entry, Map<String, Object> data) {
            this.key = key; this.title = title; this.entry = entry; options = new HashMap<>(data); publications++;
        }
        public void showWindow(String title, String message, String buttonLabel) { throw new AssertionError("no window"); }
        public void hideWindow() {}
        public void log(String message) {}
    }

    public static void main(String[] args) throws Exception {
        Host host = new Host();
        DigitalRainClockPlugin plugin = new DigitalRainClockPlugin();
        plugin.start(host, new HashMap<>());
        assert host.publications == 1 : "published at start";
        assert "digital_rain_clock".equals(host.key) && "Digital Rain Clock".equals(host.title) && "clock/index.html".equals(host.entry);

        plugin.configure(new HashMap<>());
        assert host.publications == 1 : "unchanged settings do not recreate the page";

        // The defaults: the time in the rain, green, normal speed, katakana, 24-hour, drift.
        assert "Formed in the rain".equals(host.options.get("time")) && "Green".equals(host.options.get("colour"));
        assert host.options.get("customColour") == null && "Normal".equals(host.options.get("speed"));
        assert "Katakana and digits".equals(host.options.get("glyphs")) && "24-hour".equals(host.options.get("clock"));
        assert Boolean.TRUE.equals(host.options.get("drift"));

        Map<String, Object> s = new HashMap<>();
        s.put("time", "Rain only");
        s.put("colour", "Custom");
        s.put("customColour", "#AA3311");
        s.put("speed", "Calm");
        s.put("glyphs", "Digits only");
        s.put("clock", "12-hour");
        s.put("drift", false);
        plugin.configure(s);
        assert host.publications == 2 : "a changed setting publishes again";
        assert "Rain only".equals(host.options.get("time")) && "Custom".equals(host.options.get("colour"));
        assert "#AA3311".equals(host.options.get("customColour")) && "Calm".equals(host.options.get("speed"));
        assert "Digits only".equals(host.options.get("glyphs")) && "12-hour".equals(host.options.get("clock"));
        assert Boolean.FALSE.equals(host.options.get("drift"));

        s.put("customColour", "not a colour");
        s.put("speed", "Ludicrous");
        plugin.configure(s);
        assert "Green".equals(host.options.get("colour")) && host.options.get("customColour") == null : "a bad custom colour is green";
        assert "Normal".equals(host.options.get("speed")) : "an unknown value is the default";
        s.put("colour", "Amber");
        s.put("customColour", "#AA3311");
        plugin.configure(s);
        assert "Amber".equals(host.options.get("colour")) && host.options.get("customColour") == null : "the custom colour counts only for Custom";
        for (Object value : host.options.values()) {
            assert value == null || value instanceof String || value instanceof Boolean || value instanceof Number
                    : "the page takes scalar values only: " + value;
        }

        int before = host.publications;
        plugin.stop();
        plugin.configure(new HashMap<>());
        assert host.publications == before : "nothing is published after stop";
        System.out.println("DigitalRainClockTest: ok");
    }
}
