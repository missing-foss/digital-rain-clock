// SPDX-License-Identifier: Apache-2.0
package org.missing_foss.digitalrainclock;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The rendering options for assets/clock/index.html, from the plugin's settings. */
final class ClockOptions {
    private ClockOptions() {}

    /** The value if it is one of the options, else the first, the default. */
    private static String choice(Object value, String... options) {
        List<String> allowed = Arrays.asList(options);
        return value instanceof String && allowed.contains(value) ? (String) value : options[0];
    }

    static Map<String, Object> from(Map<String, Object> settings) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("time", choice(settings.get("time"), "Formed in the rain", "Rain only"));
        String colour = choice(settings.get("colour"), "Green", "Amber", "Ice", "Custom");
        Object custom = settings.get("customColour");
        boolean valid = custom instanceof String && ((String) custom).matches("#[a-fA-F0-9]{6}");
        // A custom colour that isn't one is the default green.
        data.put("colour", "Custom".equals(colour) && !valid ? "Green" : colour);
        data.put("customColour", "Custom".equals(colour) && valid ? custom : null);
        data.put("speed", choice(settings.get("speed"), "Normal", "Calm", "Fast"));
        data.put("glyphs", "Digits only".equals(settings.get("glyphs")) ? "Digits only" : "Katakana and digits");
        data.put("clock", choice(settings.get("clock"), "24-hour", "12-hour"));
        data.put("drift", !Boolean.FALSE.equals(settings.get("drift")));
        return data;
    }
}
