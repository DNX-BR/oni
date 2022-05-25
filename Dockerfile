FROM node:alpine AS base

WORKDIR /usr/src/app

COPY . .
RUN npm install; \
    npm install -g pkg; \
    pkg .

FROM debian:latest as base_debian

 RUN apt-get update ; \
     apt-get install -y \
     wget \
     runc  \
     curl \
     git



WORKDIR /root

RUN curl -sL "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh"  | bash ; \
    mv kustomize /usr/bin/kustomize ; \
    chmod +x /usr/bin/kustomize

RUN wget https://github.com/moby/buildkit/releases/download/v0.9.3/buildkit-v0.9.3.linux-amd64.tar.gz && \
    tar -xvf buildkit-v0.9.3.linux-amd64.tar.gz && cp bin/* /usr/bin/ && chmod +x /usr/bin/buildctl && chmod +x /usr/bin/buildkitd && rm -rf bin && rm -f buildkit-v0.9.3.linux-amd64.tar.gz

RUN wget https://github.com/google/go-containerregistry/releases/download/v0.8.0/go-containerregistry_Linux_x86_64.tar.gz && \
    tar -xvf go-containerregistry_Linux_x86_64.tar.gz  && mv gcrane /usr/bin/crane && chmod +x /usr/bin/crane && rm -f go-containerregistry_Linux_x86_64.tar.gz && rm -f crane

RUN mkdir -p /trivy && cd /trivy && \
    wget https://github.com/aquasecurity/trivy/releases/download/v0.23.0/trivy_0.23.0_Linux-64bit.tar.gz && \
    tar -xvf trivy_0.23.0_Linux-64bit.tar.gz && mv trivy /usr/bin/ && rm -f trivy_0.23.0_Linux-64bit.tar.gz
    

RUN wget https://github.com/mikefarah/yq/releases/download/v4.23.1/yq_linux_amd64 && mv yq_linux_amd64 /usr/bin/yq && chmod +x /usr/bin/yq

FROM base_debian

COPY --from=base /usr/src/app/dist/oni /usr/bin/oni
RUN chmod +x /usr/bin/oni