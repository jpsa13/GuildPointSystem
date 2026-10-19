package com.guild.app.websocket;

import com.guild.app.presence.PresenceChannelInterceptor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.Arrays;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /** Server → client and expected client → server heartbeat (ms); the frontend uses the same 10s. */
    private static final long[] HEARTBEAT_MS = {10_000, 10_000};

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final PresenceChannelInterceptor presenceChannelInterceptor;
    private final TaskScheduler messageBrokerTaskScheduler;
    private final int inboundThreads;
    private final int outboundThreads;
    private final String[] allowedOrigins;

    public WebSocketConfig(
            WebSocketAuthInterceptor webSocketAuthInterceptor,
            PresenceChannelInterceptor presenceChannelInterceptor,
            @Lazy @Qualifier("messageBrokerTaskScheduler") TaskScheduler messageBrokerTaskScheduler,
            @Value("${guild.websocket.inbound-threads:32}") int inboundThreads,
            @Value("${guild.websocket.outbound-threads:16}") int outboundThreads,
            @Value("${guild.cors.allowed-origins}") String allowedOrigins) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.presenceChannelInterceptor = presenceChannelInterceptor;
        this.messageBrokerTaskScheduler = messageBrokerTaskScheduler;
        this.inboundThreads = inboundThreads;
        this.outboundThreads = outboundThreads;
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toArray(String[]::new);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic", "/queue")
                // Without server heartbeats a silently dropped connection (Wi-Fi/mobile) looks alive until
                // TCP gives up; with them the client notices in seconds, reconnects and refetches.
                .setHeartbeatValue(HEARTBEAT_MS)
                .setTaskScheduler(messageBrokerTaskScheduler);
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
        // Keep per-session delivery order identical to publish order (bids must not arrive shuffled).
        registry.setPreservePublishOrder(true);
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // Same origins as REST CORS: another site can't open a socket in a member's browser.
        // SockJS also serves a raw WebSocket at /ws/websocket, which the frontend tries first.
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns(allowedOrigins)
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(webSocketAuthInterceptor, presenceChannelInterceptor);
        // Bids run on these threads and may wait on an auction's row lock: keep enough of them that a
        // contested auction can't stall every other inbound frame (default is 2 × CPU cores).
        registration.taskExecutor().corePoolSize(inboundThreads).maxPoolSize(inboundThreads);
    }

    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.taskExecutor().corePoolSize(outboundThreads).maxPoolSize(outboundThreads);
    }
}
