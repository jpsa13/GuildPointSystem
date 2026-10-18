package com.guild.app.websocket;

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

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /** Server → client and expected client → server heartbeat (ms); the frontend uses the same 10s. */
    private static final long[] HEARTBEAT_MS = {10_000, 10_000};

    private final WebSocketAuthInterceptor webSocketAuthInterceptor;
    private final TaskScheduler messageBrokerTaskScheduler;
    private final int inboundThreads;
    private final int outboundThreads;

    public WebSocketConfig(
            WebSocketAuthInterceptor webSocketAuthInterceptor,
            @Lazy @Qualifier("messageBrokerTaskScheduler") TaskScheduler messageBrokerTaskScheduler,
            @Value("${guild.websocket.inbound-threads:32}") int inboundThreads,
            @Value("${guild.websocket.outbound-threads:16}") int outboundThreads) {
        this.webSocketAuthInterceptor = webSocketAuthInterceptor;
        this.messageBrokerTaskScheduler = messageBrokerTaskScheduler;
        this.inboundThreads = inboundThreads;
        this.outboundThreads = outboundThreads;
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
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(webSocketAuthInterceptor);
        // Bids run on these threads and may wait on an auction's row lock: keep enough of them that a
        // contested auction can't stall every other inbound frame (default is 2 × CPU cores).
        registration.taskExecutor().corePoolSize(inboundThreads).maxPoolSize(inboundThreads);
    }

    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.taskExecutor().corePoolSize(outboundThreads).maxPoolSize(outboundThreads);
    }
}
