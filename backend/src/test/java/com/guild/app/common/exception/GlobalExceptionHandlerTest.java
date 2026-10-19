package com.guild.app.common.exception;

import com.guild.app.common.logging.RequestLogContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void unexpectedErrorsBecome500WithTheRequestId() throws Exception {
        MDC.put(RequestLogContext.REQUEST_ID, "abc23xyz9k");
        var response = handler.handleUnexpected(new IllegalStateException("boom"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).containsEntry("requestId", "abc23xyz9k");
        assertThat(response.getBody().get("message")).doesNotContain("boom");
    }

    @Test
    void springMvcExceptionsKeepTheirStatus() throws Exception {
        assertThat(handler.handleUnexpected(new NoResourceFoundException(HttpMethod.GET, "x")).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(handler.handleUnexpected(new HttpRequestMethodNotSupportedException("PUT")).getStatusCode())
                .isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
    }

    @Test
    void securityExceptionsAreLeftToSpringSecurity() {
        assertThatThrownBy(() -> handler.handleUnexpected(new AccessDeniedException("no")))
                .isInstanceOf(AccessDeniedException.class);
    }
}
