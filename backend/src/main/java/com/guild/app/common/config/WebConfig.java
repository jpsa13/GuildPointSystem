package com.guild.app.common.config;

import com.guild.app.common.logging.AccessLogFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.security.SecurityProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.web.filter.ShallowEtagHeaderFilter;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.IOException;
import java.time.Duration;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Value("${guild.upload.base-path}")
    private String uploadPath;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Uploads are stored under random UUID names and never rewritten, so the browser may keep them.
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:" + uploadPath + "/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
    }

    /**
     * Game catalog and seeds only change with a deploy. The browser keeps them and revalidates with the
     * ETag: an unchanged payload (up to ~170 KB) comes back as an empty 304, and a deploy is seen at once.
     */
    @Bean
    FilterRegistrationBean<ShallowEtagHeaderFilter> staticDataEtagFilter() {
        var filter = new RevalidatedEtagFilter();
        // Weak ETag: Tomcat refuses to gzip a response carrying a strong one (it would have to differ per encoding).
        filter.setWriteWeakETag(true);
        var registration = new FilterRegistrationBean<ShallowEtagHeaderFilter>(filter);
        registration.addUrlPatterns("/api/catalog/*", "/api/seeds/*");
        return registration;
    }

    /** Runs before Spring Security (order -100) so 401/403 responses are logged too. */
    @Bean
    FilterRegistrationBean<AccessLogFilter> accessLogFilter() {
        var registration = new FilterRegistrationBean<>(new AccessLogFilter());
        registration.addUrlPatterns("/api/*");
        registration.setOrder(SecurityProperties.DEFAULT_FILTER_ORDER - 10);
        return registration;
    }

    /** Replaces Spring Security's default {@code no-store}, which keeps the browser from storing the ETag at all. */
    private static final class RevalidatedEtagFilter extends ShallowEtagHeaderFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
                throws ServletException, IOException {
            response.setHeader(HttpHeaders.CACHE_CONTROL, CacheControl.noCache().cachePublic().getHeaderValue());
            super.doFilterInternal(request, response, chain);
        }
    }
}
