package com.guild.app.common.logging;

import org.junit.jupiter.api.Test;
import org.slf4j.event.Level;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class AccessLogFilterTest {

    @Test
    void levelFollowsStatusAndSpeed() {
        assertThat(AccessLogFilter.level(200, 30)).isEqualTo(Level.INFO);
        assertThat(AccessLogFilter.level(200, 1500)).isEqualTo(Level.WARN);
        assertThat(AccessLogFilter.level(404, 5)).isEqualTo(Level.WARN);
        assertThat(AccessLogFilter.level(503, 5)).isEqualTo(Level.ERROR);
    }

    @Test
    void clientIpComesFromTheProxyHeader() {
        var request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.5");
        assertThat(AccessLogFilter.clientIp(request)).isEqualTo("10.0.0.5");
        request.addHeader("X-Forwarded-For", "187.10.20.30, 10.0.0.1");
        assertThat(AccessLogFilter.clientIp(request)).isEqualTo("187.10.20.30");
    }

    @Test
    void requestIdsAreShortAndUnambiguous() {
        var id = RequestLogContext.newRequestId();
        assertThat(id).hasSize(10).matches("[a-z2-9]+").doesNotContain("0", "1", "o", "l", "i");
    }
}
