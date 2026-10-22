package com.guild.app.common.exception;

import com.guild.app.common.logging.RequestLogContext;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(AppException.class)
    public ResponseEntity<Map<String, String>> handleAppException(AppException ex) {
        return ResponseEntity.status(ex.getStatus()).body(Map.of("message", ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(e -> e.getDefaultMessage())
                .orElse("Verifique os dados e tente novamente.");
        return ResponseEntity.badRequest().body(Map.of("message", message));
    }

    /**
     * A unique constraint lost a race (e.g. the same member joined two PTs at once, or a double click
     * created two PTs). The DB kept things consistent; tell the user instead of a bare 500.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleDataIntegrity(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("message", "Outra ação aconteceu ao mesmo tempo. A tela foi atualizada — tente de novo."));
    }

    @ExceptionHandler(LockedException.class)
    public ResponseEntity<Map<String, String>> handleLocked(LockedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("message", "Sua conta foi rejeitada."));
    }

    @ExceptionHandler(DisabledException.class)
    public ResponseEntity<Map<String, String>> handleDisabled(DisabledException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("message", "Sua conta está suspensa. Fale com a liderança da guild."));
    }

    @ExceptionHandler({BadCredentialsException.class, UsernameNotFoundException.class})
    public ResponseEntity<Map<String, String>> handleBadCredentials() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("message", "Email ou senha incorretos."));
    }

    /** Malformed JSON body or a path/query value of the wrong type (e.g. /auctions/abc). */
    @ExceptionHandler({HttpMessageNotReadableException.class, TypeMismatchException.class})
    public ResponseEntity<Map<String, String>> handleBadRequest() {
        return ResponseEntity.badRequest().body(Map.of("message", "Requisição inválida."));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> handleUploadTooLarge() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("message", "Arquivo grande demais."));
    }

    /**
     * Anything unexpected: logged with its stack trace (the MDC ties it to the request id and member) and
     * answered as JSON, so the response keeps X-Request-Id and the member can report the code.
     * Spring's own MVC exceptions keep their status (404, 405, …); security exceptions are left to
     * Spring Security (401/403).
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex) throws Exception {
        if (ex instanceof AccessDeniedException || ex instanceof AuthenticationException) throw ex;
        if (ex instanceof ErrorResponse errorResponse) {
            var status = errorResponse.getStatusCode();
            var detail = errorResponse.getBody().getDetail();
            return ResponseEntity.status(status).body(Map.of("message", detail != null ? detail : "Requisição inválida."));
        }
        log.error("Unexpected error handling the request", ex);
        var requestId = MDC.get(RequestLogContext.REQUEST_ID);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
                "message", "Erro inesperado no servidor. Tente de novo.",
                "requestId", requestId != null ? requestId : ""));
    }
}
