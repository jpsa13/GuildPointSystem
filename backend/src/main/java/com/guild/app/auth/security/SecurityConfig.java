package com.guild.app.auth.security;

import com.guild.app.common.enums.Role;
import com.guild.app.common.logging.RequestLogContext;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final RestSecurityHandlers restSecurityHandlers;
    private final String allowedOrigins;
    private final String metricsScrapeToken;

    public SecurityConfig(
            JwtAuthFilter jwtAuthFilter,
            RestSecurityHandlers restSecurityHandlers,
            @Value("${guild.cors.allowed-origins}") String allowedOrigins,
            @Value("${guild.metrics.scrape-token:}") String metricsScrapeToken) {
        this.jwtAuthFilter = jwtAuthFilter;
        this.restSecurityHandlers = restSecurityHandlers;
        this.allowedOrigins = allowedOrigins;
        this.metricsScrapeToken = metricsScrapeToken;
    }

    @Bean
    @Order(1)
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .securityMatcher("/api/**", "/ws/**", "/actuator/**", "/uploads/**")
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .oauth2Login(AbstractHttpConfigurer::disable)
                .oauth2Client(AbstractHttpConfigurer::disable)
                .cors(c -> c.configurationSource(corsConfigurationSource()))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health").permitAll()
                        // Latency, pool and socket metrics: leadership only.
                        .requestMatchers("/actuator/metrics", "/actuator/metrics/**")
                        .hasAnyRole(Role.ADMINISTRADOR.name(), Role.LIDER.name())
                        // Prometheus format for the collector (Grafana Alloy): static scrape token only.
                        .requestMatchers("/actuator/prometheus")
                        .access(new ScrapeTokenAuthorizationManager(metricsScrapeToken))
                        .requestMatchers("/api/auth/**").permitAll()
                        // Ingestao do cliente CerberusBags: autentica pelo token de pareamento no proprio corpo/header.
                        .requestMatchers(HttpMethod.POST, "/api/character-status/ingest").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/quest-status/ingest").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/equipment-status/ingest").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/party-invites/pending").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/party-invites/*/done").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/quests/ingest").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/quests/live/ingest").permitAll()
                        .requestMatchers("/ws/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/seeds/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/catalog/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/uploads/**").permitAll()
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(restSecurityHandlers)
                        .accessDeniedHandler(restSecurityHandlers))
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource() {
        var config = new CorsConfiguration();
        config.setAllowedOrigins(Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        // X-Request-Id: shown on server errors so a member can report the exact request.
        config.setExposedHeaders(List.of("Authorization", RequestLogContext.REQUEST_ID_HEADER));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
